import { ArrayNotEmpty, IsArray, IsEmail, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateTenantInvitationDto {
  @IsOptional()
  @IsString()
  @Matches(/^\\+?[0-9() -]{6,32}$/)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(190)
  email?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  roleIds!: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  expiresInHours?: number;
}

export class CreateTenantRoleDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{1,79}$/)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  permissionCodes!: string[];
}

export class AssignTenantRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}
