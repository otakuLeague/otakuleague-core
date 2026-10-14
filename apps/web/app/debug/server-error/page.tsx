import { notFound } from 'next/navigation';

/** Deliberate server rendering error to check Sentry end to end. A 404 in production (ADR 0004). */
export default function ServerErrorPage(): never {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  throw new Error('Deliberate test error from the web server (OTA-79)');
}
