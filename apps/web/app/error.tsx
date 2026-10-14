'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { reportRenderError } from '../src/observability/sentry';

export interface ErrorPageProps {
  /** Never rendered: its message can be internal. Reported to Sentry from the server (with a digest) or from here (without one). */
  readonly error: Error & { readonly digest?: string };
  readonly retry: () => void;
}

export default function ErrorPage({ error, retry }: ErrorPageProps) {
  useEffect(() => {
    reportRenderError(error);
  }, [error]);

  return (
    <main>
      <h1>Something went wrong</h1>
      <p>This page could not be shown. Try again in a moment.</p>
      <button type="button" onClick={retry}>
        Try again
      </button>
      <Link href="/">Back to home</Link>
    </main>
  );
}
