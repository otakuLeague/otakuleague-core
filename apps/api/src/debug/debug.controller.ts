import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

/** Deliberate failures to check error reporting end to end. Never loaded in production (ADR 0004). */
@ApiExcludeController()
@Controller('debug')
export class DebugController {
  @Get('error')
  throwError(): never {
    throw new Error('Deliberate test error from the API (OTA-79)');
  }
}
