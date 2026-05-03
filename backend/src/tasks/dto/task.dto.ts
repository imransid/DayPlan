import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, MaxLength, IsInt, Min } from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({ example: 'Review PR #284' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: '2026-05-03', description: 'YYYY-MM-DD; defaults to today' })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(0)
  @IsOptional()
  position?: number;
}

export class UpdateTaskDto {
  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  title?: string;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(0)
  @IsOptional()
  position?: number;
}

export class TaskResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  date!: string;

  @ApiProperty({ nullable: true })
  doneAt!: string | null;

  @ApiProperty()
  position!: number;
}
