import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { Argon2id, NodeArgon2id } from './argon2id';
import { AuthController } from './auth.controller';
import { AuthCleanupScheduler } from './auth-cleanup.scheduler';
import { AuthCleanupService } from './auth-cleanup.service';
import { AuthRateLimiter } from './auth-rate-limiter';
import { AuthSecrets, EnvironmentAuthSecrets } from './auth-secrets';
import { CredentialGuard } from './credential.guard';
import { HashSlots } from './hash-slots';
import { MeController } from './me.controller';
import { PasswordHasher } from './password-hasher';
import { PasswordRehasher } from './password-rehasher';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';
import { SignInService } from './sign-in.service';

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
    AuthCleanupService,
    AuthCleanupScheduler,
  ],
  exports: [PasswordHasher],
})
export class AuthModule {}
