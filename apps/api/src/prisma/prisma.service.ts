import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaClient } from '../generated/prisma/client';

// pg defaults to no timeouts: a connect to an unreachable host, or a query to a
// stalled server, would hold a pool slot until the OS gives up. The health check
// stops waiting after 2 s, but only these settle the abandoned query.
const CONNECT_TIMEOUT_MS = 5_000;
const QUERY_TIMEOUT_MS = 10_000;

// No $connect at boot: Prisma connects on the first query, so the API starts
// (and /health answers 503) while PostgreSQL is down.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
        query_timeout: QUERY_TIMEOUT_MS,
      }),
      // Default errors quote the failing call with its arguments; the filter logs 5xx messages.
      errorFormat: 'minimal',
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
