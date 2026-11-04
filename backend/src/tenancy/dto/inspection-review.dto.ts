import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewInspectionOrderDto {
  @IsIn(['approved', 'returned'])
  action!: 'approved' | 'returned';

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  comment?: string;
}
