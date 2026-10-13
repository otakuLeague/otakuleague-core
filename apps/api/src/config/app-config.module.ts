import { ConfigModule } from '@nestjs/config';
import {
  isInsideRepo,
  REPO_ROOT_ENV_FILE,
  validateEnvironment,
} from './environment';

// A missing .env file is skipped; real environment variables override the file.
export const AppConfigModule = ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  envFilePath: REPO_ROOT_ENV_FILE,
  ignoreEnvFile: !isInsideRepo(),
  validate: validateEnvironment,
});
