import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MeController } from './me.controller';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Module({
  imports: [PrismaModule],
  controllers: [MeController],
  providers: [SessionService, SessionGuard],
})
export class AuthModule {}
