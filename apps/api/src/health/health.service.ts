import { Injectable, Logger } from '@nestjs/common';
import type { HealthResponse } from '@otakuleague/shared-types';
import { PrismaService } from '../prisma/prisma.service';

export const DATABASE_CHECK_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    try {
      await withTimeout(
        this.prisma.$queryRaw`SELECT 1`,
        DATABASE_CHECK_TIMEOUT_MS,
      );
      return { status: 'ok', checks: { database: 'up' } };
    } catch (error) {
      this.logger.warn(
        `Database check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: 'error', checks: { database: 'down' } };
    }
  }
}
