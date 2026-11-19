import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaModule } from '../prisma/prisma.module';
import { Argon2id, NodeArgon2id } from './argon2id';
import { AuthController } from './auth.controller';
import {
  AuthCleanupAlerts,
  AuthCleanupScheduler,
  SentryAuthCleanupAlerts,
} from './auth-cleanup.scheduler';
import { AuthCleanupService } from './auth-cleanup.service';
import { AuthRateLimiter } from './auth-rate-limiter';
import { AuthSecrets, EnvironmentAuthSecrets } from './auth-secrets';
import { CredentialGuard } from './credential.guard';
import { EmailSender, emailSenderFor } from './email-sender';
import { HashSlots } from './hash-slots';
import { MeController } from './me.controller';
import { PasswordHasher } from './password-hasher';
import { PasswordRehasher } from './password-rehasher';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';
import { SignInService } from './sign-in.service';
import { SignUpService } from './sign-up.service';

@Module({
  imports: [PrismaModule],
  controllers: [MeController, AuthController],
  providers: [
    SessionService,
    SessionGuard,
    PasswordHasher,
    PasswordRehasher,
    HashSlots,
    { provide: Argon2id, useClass: NodeArgon2id },
    { provide: AuthSecrets, useClass: EnvironmentAuthSecrets },
    AuthRateLimiter,
    CredentialGuard,
    SignInService,
    SignUpService,
    {
      provide: EmailSender,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        emailSenderFor(config.get('NODE_ENV', { infer: true })),
    },
    AuthCleanupService,
    AuthCleanupScheduler,
    { provide: AuthCleanupAlerts, useClass: SentryAuthCleanupAlerts },
  ],
  exports: [PasswordHasher],
})
export class AuthModule {}
