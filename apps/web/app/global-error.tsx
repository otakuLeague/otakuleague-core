'use client';

import { APP_NAME } from '@otakuleague/shared-types';
import { useEffect } from 'react';
import { reportRenderError } from '../src/observability/sentry';
import type { ErrorPageProps } from './error';
import './globals.css';

/** Replaces the root layout when it fails, so it brings its own html, body and title. */
export default function GlobalError({ error, retry }: ErrorPageProps) {
  useEffect(() => {
    reportRenderError(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <title>{`Error | ${APP_NAME}`}</title>
        <main>
          <h1>Something went wrong</h1>
          <p>{APP_NAME} could not load. Try again in a moment.</p>
          <button type="button" onClick={retry}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
