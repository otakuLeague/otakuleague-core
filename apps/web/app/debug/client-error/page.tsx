import { notFound } from 'next/navigation';
import { ThrowInBrowserButton } from './throw-in-browser-button';

/** Deliberate browser error to check Sentry end to end. A 404 outside development and test (ADR 0004). */
export default function ClientErrorPage() {
  if (
    process.env.NODE_ENV !== 'development' &&
    process.env.NODE_ENV !== 'test'
  ) {
    notFound();
  }
  return (
    <main>
      <h1>Browser error check</h1>
      <ThrowInBrowserButton />
    </main>
  );
}
