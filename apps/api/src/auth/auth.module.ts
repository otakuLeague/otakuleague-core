import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { Argon2id, NodeArgon2id } from './argon2id';
import { HashSlots } from './hash-slots';
import { MeController } from './me.controller';
import { PasswordHasher } from './password-hasher';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Module({
  imports: [PrismaModule],
  controllers: [MeController],
  providers: [
    SessionService,
    SessionGuard,
    PasswordHasher,
    HashSlots,
    { provide: Argon2id, useClass: NodeArgon2id },
  ],
  exports: [PasswordHasher],
})
export class AuthModule {}
