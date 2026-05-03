import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskResponseDto } from '../dto/task.dto';

export class CreateTaskCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly title: string,
    public readonly date?: string,
    public readonly position?: number,
  ) {}
}

@Injectable()
@CommandHandler(CreateTaskCommand)
export class CreateTaskHandler implements ICommandHandler<CreateTaskCommand, TaskResponseDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: CreateTaskCommand): Promise<TaskResponseDto> {
    const date = cmd.date ? new Date(cmd.date) : new Date();
    date.setUTCHours(0, 0, 0, 0);

    const position =
      cmd.position ??
      (await this.prisma.task.count({
        where: { userId: cmd.userId, date },
      }));

    const task = await this.prisma.task.create({
      data: {
        userId: cmd.userId,
        title: cmd.title,
        date,
        position,
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
