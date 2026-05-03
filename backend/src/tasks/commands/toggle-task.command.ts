import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskResponseDto } from '../dto/task.dto';

export class ToggleTaskCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly taskId: string,
  ) {}
}

@Injectable()
@CommandHandler(ToggleTaskCommand)
export class ToggleTaskHandler implements ICommandHandler<ToggleTaskCommand, TaskResponseDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: ToggleTaskCommand): Promise<TaskResponseDto> {
    const existing = await this.prisma.task.findFirst({
      where: { id: cmd.taskId, userId: cmd.userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const task = await this.prisma.task.update({
      where: { id: cmd.taskId },
      data: { doneAt: existing.doneAt ? null : new Date() },
    });

    return {
      id: task.id,
      title: task.title,
      date: task.date.toISOString().split('T')[0],
      doneAt: task.doneAt?.toISOString() ?? null,
      position: task.position,
    };
  }
}
