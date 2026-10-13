import { Controller, Get } from '@nestjs/common';
import type { AppInfo } from '@otakuleague/shared-types';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getAppInfo(): AppInfo {
    return this.appService.getAppInfo();
  }
}
