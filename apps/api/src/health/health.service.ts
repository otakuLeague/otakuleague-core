import { Injectable, Logger } from '@nestjs/common';
import type { HealthResponse } from '@otakuleague/shared-types';
import { PrismaService } from '../prisma/prisma.service';

export const DATABASE_CHECK_TIMEOUT_MS = 2_000;
/** OTA-200 pins every pool to UTC; a pooler that drops the startup option breaks that silently. */
const REQUIRED_SESSION_ZONE = 'UTC';
const LOGGED_ZONE_MAX_CHARS = 64;

/** The `zone` of the first row of `SELECT current_setting('TimeZone') AS zone`, or undefined. */
export function sessionZoneOf(rows: unknown): string | undefined {
  if (!Array.isArray(rows)) return undefined;
  const first: unknown = rows[0];
  if (typeof first !== 'object' || first === null) return undefined;
  const zone = (first as Record<string, unknown>).zone;
  return typeof zone === 'string' ? zone : undefined;
}

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
      const rows = await withTimeout(
        this.prisma.$queryRaw`SELECT current_setting('TimeZone') AS zone`,
        DATABASE_CHECK_TIMEOUT_MS,
      );
      const zone = sessionZoneOf(rows);
      if (zone !== REQUIRED_SESSION_ZONE) {
        const shown =
          zone === undefined
            ? 'unreadable'
            : `"${zone.slice(0, LOGGED_ZONE_MAX_CHARS)}"`;
        this.logger.warn(
          `Database session time zone is ${shown}, not ${REQUIRED_SESSION_ZONE}: the OTA-200 pin is not in effect`,
        );
        return { status: 'error', checks: { database: 'down' } };
      }
      return { status: 'ok', checks: { database: 'up' } };
    } catch (error) {
      this.logger.warn(
        `Database check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: 'error', checks: { database: 'down' } };
    }
  }
}
