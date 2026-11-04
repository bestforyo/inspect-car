import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateReportShareDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}
