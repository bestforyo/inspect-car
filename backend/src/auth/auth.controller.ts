import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from './auth-user.interface';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('identity')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class AuthController {
  @Get()
  @ApiOperation({ summary: 'Return verified identity and active tenant membership' })
  getCurrentUser(@CurrentUser() user: AuthUser): AuthUser { return user; }
}
