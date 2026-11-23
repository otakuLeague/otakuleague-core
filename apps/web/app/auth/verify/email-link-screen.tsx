import Link from 'next/link';
import { FocusHeading } from '../../../src/auth/focus-heading';
import '../../styles/auth.css';

type EmailLinkScreenProps = {
  /** `ok` when the address is confirmed (a check), `wait` when the link did not do it (a clock). */
  readonly tone: 'ok' | 'wait';
  readonly heading: string;
  readonly sentence: string;
  /** `primary` is the next step as a button; `back` is a quiet way out under the sentence. */
  readonly link: {
    readonly href: '/' | '/auth';
    readonly label: string;
    readonly look: 'primary' | 'back';
  };
};

/** Stroke paths on a 24-unit grid, drawn in `currentColor`: a check, and a clock face with its hands. */
const BADGE_PATHS = {
  ok: ['M5 12.5l4.5 4.5L19 7.5'],
  wait: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 7v5l3.5 2'],
} as const;

/**
 * One landing of the emailed link (ADR 0015 Addendum 1f-vi, decision 8): badge, the `h1` focused on
 * arrival, one sentence, one link. Static: no request-time read, no API call, no live region.
 */
export function EmailLinkScreen({
  tone,
  heading,
  sentence,
  link,
}: EmailLinkScreenProps) {
  return (
    <main className="au-page">
      <div className="au-badge" data-tone={tone} aria-hidden="true">
        <svg
          className="au-badge-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          {BADGE_PATHS[tone].map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </div>
      <FocusHeading>{heading}</FocusHeading>
      <p className="au-sub">{sentence}</p>
      {link.look === 'primary' ? (
        <Link className="ol-btn ol-btn--primary au-btn" href={link.href}>
          {link.label}
        </Link>
      ) : (
        <p className="au-foot">
          <Link href={link.href}>{link.label}</Link>
        </p>
      )}
    </main>
  );
}
