import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from './auth-user.interface';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

class RefreshSessionDto {
  @IsString()
  @MinLength(40)
  @MaxLength(200)
  refreshToken!: string;
}

@ApiTags('identity')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate an opaque refresh token and issue a new access token' })
  refresh(@Body() body: RefreshSessionDto) {
    return this.auth.refreshSession(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the supplied refresh token for the authenticated user' })
  async logout(@CurrentUser() user: AuthUser, @Body() body: RefreshSessionDto): Promise<void> {
    await this.auth.revokeRefreshToken(body.refreshToken, user.sub);
  }
}
