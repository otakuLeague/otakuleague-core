'use client';

import Link from 'next/link';

export interface ErrorPageProps {
  /** Never rendered: its message can be internal. Server errors are in the server log (by digest); client errors are not reported yet. */
  readonly error: Error & { readonly digest?: string };
  readonly retry: () => void;
}

export default function ErrorPage({ retry }: ErrorPageProps) {
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
