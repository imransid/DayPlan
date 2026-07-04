import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { SchedulerUserController } from './scheduler-user.controller';
import { DiscordModule } from '../discord/discord.module';

@Module({
  imports: [DiscordModule],
  controllers: [SchedulerController, SchedulerUserController],
  providers: [SchedulerService],
})
export class SchedulerModule {}
