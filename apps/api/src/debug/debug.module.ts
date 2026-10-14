import { Module } from '@nestjs/common';
import { DebugController } from './debug.controller';

/** Allowlist: any other NODE_ENV, including one added later such as staging, gets no debug routes. */
export function debugRoutesEnabled(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
}

@Module({ controllers: [DebugController] })
export class DebugModule {}
