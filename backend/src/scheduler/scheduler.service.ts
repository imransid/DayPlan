import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DateTime } from "luxon";
import { PrismaService } from "../../prisma/prisma.service";
import {
  DiscordPosterService,
  PostKind,
} from "../discord/services/discord-poster.service";

/**
 * Whether to run the every-minute posting loop *inside this process*.
 *
 * DEFAULT ON — only an explicit `ENABLE_INPROCESS_CRON="false"` turns it off.
 * Previously this defaulted OFF (required the value to be exactly "true"), so a
 * deployment that never set the env var had NOTHING driving the clock and
 * scheduled posts silently never went out — the single most common cause of
 * "manual works, auto doesn't".
 *
 * The in-process `@Cron` only fires while a Node process is alive and ticking.
 * On a sleeping free tier (e.g. Render free spins down when idle) it won't tick
 * while asleep — pair it with an external trigger (the GitHub Action calling
 * `POST /api/internal/cron/run-due-posts`) and/or the per-user foreground
 * trigger (`POST /api/scheduler/run-mine`, fired when the app opens).
 *
 * Posting is idempotent per (user, kind, local-day) and guarded by an in-flight
 * lock, so running the in-process cron AND an external trigger together never
 * double-posts — the second one just no-ops.
 */
function inProcessCronEnabled(): boolean {
  return process.env.ENABLE_INPROCESS_CRON !== "false";
}

interface SchedulableUser {
  id: string;
  email: string;
  timezone: string;
  goalPostTime: string;
  workUpdateTime: string;
}

const SCHEDULABLE_USER_SELECT = {
  id: true,
  email: true,
  timezone: true,
  goalPostTime: true,
  workUpdateTime: true,
} as const;

export interface RunDuePostsSummary {
  ranAt: string;
  usersConsidered: number;
  goalPosted: number;
  workUpdatePosted: number;
  skipped: number;
  errors: number;
}

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  /**
   * Guards against overlapping runs — a slow run (many users) plus the next
   * minute tick or a duplicate HTTP trigger would otherwise contend on the DB
   * pool and race on the idempotency check.
   */
  private running = false;

  /** Per-user in-flight guard for the foreground trigger (run-mine), so a rapid
   *  background↔foreground toggle can't race two posting passes for one user. */
  private readonly inFlightUsers = new Set<string>();

  /** Last completed run — surfaced by the status endpoint so you can confirm
   *  from outside that the clock is actually ticking in production. */
  private lastRun: (RunDuePostsSummary & { trigger: string }) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly discordPoster: DiscordPosterService,
  ) {}

  /**
   * In-process every-minute tick. No-ops unless `ENABLE_INPROCESS_CRON=true`,
   * so the same build can run on an always-on host (flag on) or behind an
   * external cron (flag off) without code changes.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCronTick(): Promise<void> {
    if (!inProcessCronEnabled()) return;
    try {
      await this.runDuePosts();
    } catch (err) {
      // @nestjs/schedule discards the returned promise, so an unhandled
      // rejection here would vanish silently. Log it ourselves.
      this.logger.error("In-process cron tick failed", err as Error);
    }
  }

  /**
   * Post any goal / work-update messages that are DUE and not yet posted today.
   * Trigger-agnostic: invoked by the in-process `@Cron` AND the HTTP cron
   * endpoint.
   *
   * Uses a catch-up window (`localTime >= scheduledTime`) combined with
   * per-(user, kind, local-day) idempotency instead of exact-minute equality.
   * That way a missed minute (sleep, cold start, restart, deploy, a slow tick)
   * still posts once — later that same local day — rather than being lost until
   * tomorrow, and a re-trigger never double-posts.
   */
  async runDuePosts(): Promise<RunDuePostsSummary> {
    const ranAt = DateTime.utc().toISO()!;
    const summary: RunDuePostsSummary = {
      ranAt,
      usersConsidered: 0,
      goalPosted: 0,
      workUpdatePosted: 0,
      skipped: 0,
      errors: 0,
    };

    if (this.running) {
      this.logger.warn("runDuePosts skipped — previous run still in progress");
      return summary;
    }
    this.running = true;

    try {
      let users: SchedulableUser[];
      try {
        users = await this.prisma.user.findMany({
          select: SCHEDULABLE_USER_SELECT,
        });
      } catch (err) {
        // Previously this awaited *outside* any try/catch, so a DB blip or a
        // schema drift rejected the whole tick with zero log output — a classic
        // silent "nothing ever posts". Surface it and end the run cleanly.
        this.logger.error(
          "runDuePosts: failed to load users — aborting this run",
          err as Error,
        );
        summary.errors++;
        this.recordRun(summary, "cron/http");
        return summary;
      }

      summary.usersConsidered = users.length;

      for (const user of users) {
        await this.processUser(user, summary);
      }

      this.recordRun(summary, "cron/http");
      return summary;
    } finally {
      this.running = false;
    }
  }

  /**
   * Run the due-posts check for a SINGLE user. Fired by the app when it comes
   * to the foreground (`POST /api/scheduler/run-mine`) so a user's scheduled
   * post goes out the moment they open the app after their target time — the
   * reliable path on a sleeping free tier where the every-minute cron isn't
   * ticking. Idempotent (per-user, per-kind, per-local-day), so calling it on
   * every foreground is safe and cheap.
   */
  async runDuePostsForUser(userId: string): Promise<RunDuePostsSummary> {
    const ranAt = DateTime.utc().toISO()!;
    const summary: RunDuePostsSummary = {
      ranAt,
      usersConsidered: 0,
      goalPosted: 0,
      workUpdatePosted: 0,
      skipped: 0,
      errors: 0,
    };

    if (this.inFlightUsers.has(userId)) return summary;
    this.inFlightUsers.add(userId);
    try {
      let user: SchedulableUser | null;
      try {
        user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: SCHEDULABLE_USER_SELECT,
        });
      } catch (err) {
        this.logger.error(
          `runDuePostsForUser: failed to load user ${userId}`,
          err as Error,
        );
        summary.errors++;
        return summary;
      }
      if (!user) return summary;

      summary.usersConsidered = 1;
      await this.processUser(user, summary);
      this.recordRun(summary, "run-mine");
      return summary;
    } finally {
      this.inFlightUsers.delete(userId);
    }
  }

  /** Snapshot of the last run — used by the status endpoint for triage. */
  getStatus() {
    return {
      inProcessCronEnabled: inProcessCronEnabled(),
      now: DateTime.utc().toISO(),
      lastRun: this.lastRun,
    };
  }

  private recordRun(summary: RunDuePostsSummary, trigger: string): void {
    this.lastRun = { ...summary, trigger };
  }

  /**
   * Evaluate one user's due goal/work-update posts against their local clock.
   * Shared by the full run (cron/HTTP) and the per-user foreground trigger.
   */
  private async processUser(
    user: SchedulableUser,
    summary: RunDuePostsSummary,
  ): Promise<void> {
    // Defensive: a bad timezone string ("Asia/Dahka") makes `setZone`
    // invalid and `toFormat` return "Invalid DateTime", which would never
    // match. Skip and warn instead.
    const local = DateTime.now().setZone(user.timezone);
    if (!local.isValid) {
      this.logger.warn(
        `User ${user.email} has invalid timezone "${user.timezone}" — skipping`,
      );
      return;
    }
    // Zero-padded 24h "HH:mm" — safe to compare lexically against the
    // equally-padded goalPostTime/workUpdateTime strings.
    const localTime = local.toFormat("HH:mm");

    if (user.goalPostTime && localTime >= user.goalPostTime) {
      await this.fireIfNotPosted(user, "goal", summary);
    }
    if (user.workUpdateTime && localTime >= user.workUpdateTime) {
      await this.fireIfNotPosted(user, "work_update", summary);
    }
  }

  /**
   * Post one kind for one user unless it already succeeded today (idempotency).
   * Never throws — a single user's failure must not abort the whole run.
   */
  private async fireIfNotPosted(
    user: { id: string; email: string; timezone: string },
    kind: PostKind,
    summary: RunDuePostsSummary,
  ): Promise<void> {
    // ── Personal channels (guarded by personal idempotency) ──
    try {
      const already = await this.discordPoster.hasSuccessfulPostToday(
        user.id,
        kind,
        user.timezone,
      );
      if (already) {
        summary.skipped++;
      } else {
        const result =
          kind === "goal"
            ? await this.discordPoster.postGoalList(user.id)
            : await this.discordPoster.postWorkUpdate(user.id);

        if (result.posted > 0) {
          if (kind === "goal") summary.goalPosted++;
          else summary.workUpdatePosted++;
          this.logger.log(
            `[${kind}] User ${user.email}: posted ${result.posted}, failed ${result.failed}`,
          );
        } else {
          // Nothing delivered (no eligible channel, or an empty work-update
          // skipped by design). Will retry next tick until it succeeds or the
          // local day rolls over.
          summary.skipped++;
          if (result.failed > 0) {
            this.logger.warn(
              `[${kind}] User ${user.email}: 0 posted, ${result.failed} failed`,
            );
          }
        }
      }
    } catch (err) {
      summary.errors++;
      this.logger.error(`[${kind}] Failed for user ${user.email}`, err as Error);
    }

    // ── Team/shared channels (independent, own idempotency) ──
    // Must run regardless of the personal guard above: a member may have no
    // personal channels, or may have already posted personally while a shared
    // feed still needs their post. postToSharedChannels is idempotent per
    // (user, shared channel, kind, day), so re-running the tick is safe.
    try {
      const shared = await this.discordPoster.postToSharedChannels(
        user.id,
        kind,
      );
      if (shared.posted > 0) {
        this.logger.log(
          `[${kind}] User ${user.email}: team posted ${shared.posted}, failed ${shared.failed}`,
        );
      }
    } catch (err) {
      summary.errors++;
      this.logger.error(
        `[${kind}] Team post failed for user ${user.email}`,
        err as Error,
      );
    }
  }
}
