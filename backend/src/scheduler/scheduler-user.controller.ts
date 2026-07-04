import { Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthUser } from "../common/decorators/current-user.decorator";
import { SchedulerService } from "./scheduler.service";

/**
 * Per-user foreground trigger for the posting scheduler.
 *
 * The mobile app calls this when it comes to the foreground. That makes a
 * user's scheduled goal / work-update post go out the moment they open the app
 * after their configured time — the reliable path when the backend is on a
 * sleeping free tier where the every-minute cron isn't ticking (opening the app
 * both wakes the dyno and fires this). No shared secret needed: it's scoped to
 * the authenticated caller and is idempotent per (user, kind, local-day), so
 * calling it on every foreground never double-posts.
 */
@ApiTags("Scheduler")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("scheduler")
export class SchedulerUserController {
  constructor(private readonly scheduler: SchedulerService) {}

  @Post("run-mine")
  @ApiOperation({
    summary: "Fire any of the current user's due scheduled posts (idempotent)",
  })
  runMine(@CurrentUser() user: AuthUser) {
    return this.scheduler.runDuePostsForUser(user.userId);
  }
}
