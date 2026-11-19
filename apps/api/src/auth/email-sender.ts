import type { EnvironmentVariables } from '../config/environment';
import type { NormalisedIdentifier } from './credential-rules';

/** A message the auth routes send; never stored (ADR 0020). `to` is the stored, normalised address. */
export type AuthEmail =
  | {
      readonly kind: 'email_verification';
      readonly to: NormalisedIdentifier;
      readonly username: string;
      readonly token: string;
    }
  /** Someone signed up with the address of a registered account: its owner is told, nothing changes. */
  | { readonly kind: 'sign_up_notice'; readonly to: NormalisedIdentifier };

/** Where auth mail leaves the API. A provider adapter (the email slice) is the only caller of its API. */
export abstract class EmailSender {
  /** False when nothing can deliver mail: sign-up then answers 503 before any write (ADR 0020 N5). */
  abstract canSend(): boolean;
  abstract send(email: AuthEmail): Promise<void>;
}

/** Starts every console line, so a developer can grep for it. */
export const CONSOLE_EMAIL_PREFIX = 'Auth email (console sender, local only): ';

/**
 * Development and test only (emailSenderFor). Writes one JSON line to stdout, straight, not
 * through the Logger, whose redaction would mask the token a developer needs to confirm: the one
 * recorded exception to "no secret in a log" (ADR 0020). JSON escapes any control character.
 */
export class ConsoleEmailSender extends EmailSender {
  canSend(): boolean {
    return true;
  }

  send(email: AuthEmail): Promise<void> {
    process.stdout.write(`${CONSOLE_EMAIL_PREFIX}${JSON.stringify(email)}\n`);
    return Promise.resolve();
  }
}

/** No provider: sign-up stays closed (503). Never called; refuses if it ever is. */
export class ClosedEmailSender extends EmailSender {
  canSend(): boolean {
    return false;
  }

  send(): Promise<void> {
    return Promise.reject(new Error('No email provider is configured'));
  }
}

/**
 * An allowlist, like debugRoutesEnabled: only development and test print mail. Production, and
 * any environment added later, get the closed sender, never the console one (ADR 0020 N5).
 */
export function emailSenderFor(
  nodeEnv: EnvironmentVariables['NODE_ENV'],
): EmailSender {
  return nodeEnv === 'development' || nodeEnv === 'test'
    ? new ConsoleEmailSender()
    : new ClosedEmailSender();
}
