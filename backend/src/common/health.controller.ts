import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

/**
 * Tiny unauthenticated liveness endpoint: `GET /api/health`.
 *
 * Cheap to hit and safe to expose — returns no data. Useful for uptime checks
 * and for warming a sleeping free-tier dyno before the cron trigger fires.
 */
@ApiExcludeController()
@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { ok: true };
  }
}
