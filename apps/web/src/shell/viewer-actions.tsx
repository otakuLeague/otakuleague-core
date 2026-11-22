import Link from 'next/link';
import { loadViewer } from '../auth/load-viewer';
import type { Viewer } from '../auth/viewer';
import { Disclosure } from './disclosure';

/** One list for the guest links and the hidden sizer, so a renamed label resizes the slot (ADR 0015 1f-iv-c). */
const GUEST_ACTIONS = [
  {
    label: 'Sign in',
    href: '/auth?mode=sign-in',
    className: 'ol-btn ol-btn--ghost ol-btn--sm',
  },
  {
    // Below 768 px only Sign in stays, until the mobile sheet (ADR 0014).
    label: 'Sign up',
    href: '/auth?mode=sign-up',
    className: 'ol-btn ol-btn--primary ol-btn--sm sh-only-desktop',
  },
] as const;

/** The avatar text: the username's first two characters, upper case (PARITY). */
export function viewerInitials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

function GuestActions() {
  return (
    <div className="sh-actions">
      {GUEST_ACTIONS.map((action) => (
        <Link
          key={action.href}
          className={action.className}
          href={action.href}
          prefetch={false}
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}

/** Static and invisible: holds the guest actions' width so no state shifts the header (N10). */
export function GuestActionsSizer() {
  return (
    <div className="sh-actions sh-sizer" aria-hidden="true">
      {GUEST_ACTIONS.map((action) => (
        <span key={action.href} className={action.className}>
          {action.label}
        </span>
      ))}
    </div>
  );
}

/** While the viewer streams: nothing with JavaScript, the guest links without it (N5). */
export function ViewerFallback() {
  return (
    <noscript>
      <GuestActions />
    </noscript>
  );
}

function AccountMenu({ username }: { readonly username: string }) {
  return (
    <Disclosure
      summary={viewerInitials(username)}
      summaryClassName="sh-avatar"
      summaryLabel="Account menu"
    >
      <p className="sh-menu__head">{username}</p>
    </Disclosure>
  );
}

export function ViewerActionsView({ viewer }: { readonly viewer: Viewer }) {
  switch (viewer.kind) {
    case 'signed_out':
      return <GuestActions />;
    case 'unavailable':
      return null;
    case 'signed_in':
      return <AccountMenu username={viewer.username} />;
    default: {
      const unhandled: never = viewer;
      return unhandled;
    }
  }
}

/** The one request-time read of the header: render it inside a `Suspense` (ADR 0014, N11). */
export async function ViewerActions() {
  return <ViewerActionsView viewer={await loadViewer()} />;
}
