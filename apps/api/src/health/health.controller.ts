import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { HealthResponse } from '@otakuleague/shared-types';
import type { Response } from 'express';
import { PublicRoute } from '../common/internal-key.guard';
import { HealthService } from './health.service';

function healthSchema(status: 'ok' | 'error', database: 'up' | 'down') {
  return {
    type: 'object',
    required: ['status', 'checks'],
    properties: {
      status: { type: 'string', enum: [status] },
      checks: {
        type: 'object',
        required: ['database'],
        properties: { database: { type: 'string', enum: [database] } },
      },
    },
  };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  // Railway's deploy gate and monitors call it without the internal key (ADR 0019).
  @PublicRoute()
  @ApiOkResponse({
    description: 'The API and its database are up.',
    schema: healthSchema('ok', 'up'),
  })
  @ApiServiceUnavailableResponse({
    description:
      'The database is unreachable or did not answer within 2 seconds. This body is the one documented exception to the error envelope.',
    schema: healthSchema('error', 'down'),
  })
  async getHealth(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponse> {
    const health = await this.healthService.check();
    // A cached 200 during an outage would hide it from monitors.
    response.setHeader('Cache-Control', 'no-store');
    response.status(
      health.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return health;
  }
}
