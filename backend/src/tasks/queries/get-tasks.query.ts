import { Injectable } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskResponseDto } from '../dto/task.dto';

export class GetTasksByDateQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly date: string,
  ) {}
}

@Injectable()
@QueryHandler(GetTasksByDateQuery)
export class GetTasksByDateHandler implements IQueryHandler<GetTasksByDateQuery, TaskResponseDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetTasksByDateQuery): Promise<TaskResponseDto[]> {
    const date = new Date(query.date);
    date.setUTCHours(0, 0, 0, 0);

    const tasks = await this.prisma.task.findMany({
      where: { userId: query.userId, date },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      date: t.date.toISOString().split('T')[0],
      doneAt: t.doneAt?.toISOString() ?? null,
      position: t.position,
    }));
  }
}

export class GetTasksHistoryQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly fromDate: string,
    public readonly toDate: string,
  ) {}
}

@Injectable()
@QueryHandler(GetTasksHistoryQuery)
export class GetTasksHistoryHandler
  implements IQueryHandler<GetTasksHistoryQuery, Record<string, TaskResponseDto[]>>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetTasksHistoryQuery): Promise<Record<string, TaskResponseDto[]>> {
    const from = new Date(query.fromDate);
    const to = new Date(query.toDate);

    const tasks = await this.prisma.task.findMany({
      where: { userId: query.userId, date: { gte: from, lte: to } },
      orderBy: [{ date: 'desc' }, { position: 'asc' }],
    });

    const grouped: Record<string, TaskResponseDto[]> = {};
    for (const t of tasks) {
      const dateKey = t.date.toISOString().split('T')[0];
      grouped[dateKey] ??= [];
      grouped[dateKey].push({
        id: t.id,
        title: t.title,
        date: dateKey,
        doneAt: t.doneAt?.toISOString() ?? null,
        position: t.position,
      });
    }
    return grouped;
  }
}
