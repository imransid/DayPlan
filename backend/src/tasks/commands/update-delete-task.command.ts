import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskResponseDto } from '../dto/task.dto';

export class UpdateTaskCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly taskId: string,
    public readonly title?: string,
    public readonly position?: number,
  ) {}
}

@Injectable()
@CommandHandler(UpdateTaskCommand)
export class UpdateTaskHandler implements ICommandHandler<UpdateTaskCommand, TaskResponseDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: UpdateTaskCommand): Promise<TaskResponseDto> {
    const existing = await this.prisma.task.findFirst({
      where: { id: cmd.taskId, userId: cmd.userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const task = await this.prisma.task.update({
      where: { id: cmd.taskId },
      data: {
        ...(cmd.title !== undefined && { title: cmd.title }),
        ...(cmd.position !== undefined && { position: cmd.position }),
      },
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

export class DeleteTaskCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly taskId: string,
  ) {}
}

@Injectable()
@CommandHandler(DeleteTaskCommand)
export class DeleteTaskHandler implements ICommandHandler<DeleteTaskCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: DeleteTaskCommand): Promise<void> {
    const existing = await this.prisma.task.findFirst({
      where: { id: cmd.taskId, userId: cmd.userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }
    await this.prisma.task.delete({ where: { id: cmd.taskId } });
  }
}
