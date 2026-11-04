import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('system')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check API process health' })
  check(): { status: 'ok'; service: string } {
    return { status: 'ok', service: 'inspect-car-api' };
  }
}