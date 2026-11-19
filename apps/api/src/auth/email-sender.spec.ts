import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normaliseIdentifier } from './credential-rules';
import {
  type AuthEmail,
  ClosedEmailSender,
  CONSOLE_EMAIL_PREFIX,
  ConsoleEmailSender,
  emailSenderFor,
} from './email-sender';

const VERIFICATION: AuthEmail = {
  kind: 'email_verification',
  to: normaliseIdentifier('frieren@example.test'),
  username: 'Frieren',
  token: 'fake-verification-token-'.padEnd(43, 'A'),
};

describe('emailSenderFor', () => {
  it('never gives production the console sender: sign-up stays closed (ADR 0020 N5)', () => {
    const sender = emailSenderFor('production');

    expect(sender).toBeInstanceOf(ClosedEmailSender);
    expect(sender).not.toBeInstanceOf(ConsoleEmailSender);
    expect(sender.canSend()).toBe(false);
  });

  it.each(['development', 'test'] as const)('prints mail in %s', (nodeEnv) => {
    const sender = emailSenderFor(nodeEnv);

    expect(sender).toBeInstanceOf(ConsoleEmailSender);
    expect(sender.canSend()).toBe(true);
  });
});

describe('ConsoleEmailSender', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes one JSON line to stdout, token included, and never through the Logger', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const log = vi.spyOn(Logger.prototype, 'log');

    await new ConsoleEmailSender().send(VERIFICATION);

    expect(write).toHaveBeenCalledExactlyOnceWith(
      `${CONSOLE_EMAIL_PREFIX}${JSON.stringify(VERIFICATION)}\n`,
    );
    expect(log).not.toHaveBeenCalled();
  });

  it('escapes a control character, so one email stays one line', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await new ConsoleEmailSender().send({
      ...VERIFICATION,
      username: 'Fri\neren',
    });

    const [line] = write.mock.calls[0] ?? [];
    expect(String(line).trimEnd()).not.toContain('\n');
  });
});

describe('ClosedEmailSender', () => {
  it('cannot send, and refuses if it is ever asked to', async () => {
    const sender = new ClosedEmailSender();

    expect(sender.canSend()).toBe(false);
    await expect(sender.send()).rejects.toThrow(
      'No email provider is configured',
    );
  });
});
