import { ConsoleLogger } from '@nestjs/common';
import { redactValue } from '@otakuleague/shared-types';
import { currentRequestId } from './request-context';

type JsonLogOptions = Parameters<ConsoleLogger['getJsonLogObject']>[1];

/** One redacted JSON object per line, with the request id on every line written during a request. */
export class JsonLogger extends ConsoleLogger {
  constructor() {
    super({ json: true });
  }

  protected override getJsonLogObject(
    message: unknown,
    options: JsonLogOptions,
  ): ReturnType<ConsoleLogger['getJsonLogObject']> {
    const logObject = super.getJsonLogObject(message, options);
    const requestId = currentRequestId();
    return redactValue(
      requestId === undefined ? logObject : { ...logObject, requestId },
    );
  }
}
