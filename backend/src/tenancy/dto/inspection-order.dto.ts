import { IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateInspectionOrderDto {
  @IsUUID('4')
  templateVersionId!: string;

  @IsOptional()
  @IsUUID('4')
  assignedToMembershipId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  vin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  plateNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  brandModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999999)
  odometerKm?: number;
}

export class SaveInspectionRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  resultCode?: string;

  @IsOptional()
  @IsObject()
  resultJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;
}
