import { Injectable } from '@nestjs/common';
import { APP_NAME, type AppInfo } from '@otakuleague/shared-types';

@Injectable()
export class AppService {
  getAppInfo(): AppInfo {
    return { name: APP_NAME };
  }
}
