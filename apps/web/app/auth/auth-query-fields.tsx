import { parseAuthMode } from '../../src/auth/auth-mode';
import { rawNextParam } from '../../src/auth/safe-next-path';
import { SignUpClosedNote } from '../../src/auth/sign-in-form-view';

export type AuthSearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

/**
 * The only part of /auth that reads the query, streamed inside the form so the rest stays in the
 * static shell (ADR 0014). `next` goes into the form exactly as sent: the action alone validates it
 * (`safeNextPath`), and React escapes it as an attribute value.
 */
export async function AuthQueryFields({
  searchParams,
}: {
  readonly searchParams: Promise<AuthSearchParams>;
}) {
  const query = await searchParams;
  const next = rawNextParam(query.next);
  return (
    <>
      {parseAuthMode(query.mode) === 'sign-up' && <SignUpClosedNote />}
      {next !== undefined && <input type="hidden" name="next" value={next} />}
    </>
  );
}
