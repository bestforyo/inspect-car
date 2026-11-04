import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreatePhotoUploadDto {
  @IsUUID('4')
  recordId!: string;

  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(20971520)
  fileSizeBytes!: number;

  @IsOptional()
  @IsDateString()
  capturedAt?: string;
}
