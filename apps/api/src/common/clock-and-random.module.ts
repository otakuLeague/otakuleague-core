import { randomUUID } from 'node:crypto';
import { Global, Injectable, Module } from '@nestjs/common';

// Inject these instead of calling new Date() or randomUUID(), so tests can pin them
// (FixedClock and SequentialRandom in testing/test-app.ts).
export abstract class Clock {
  abstract now(): Date;
}

export abstract class Random {
  abstract uuid(): string;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

@Injectable()
export class CryptoRandom extends Random {
  uuid(): string {
    return randomUUID();
  }
}

@Global()
@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: Random, useClass: CryptoRandom },
  ],
  exports: [Clock, Random],
})
export class ClockAndRandomModule {}
