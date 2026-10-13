'use client';

import { APP_NAME } from '@otakuleague/shared-types';
import type { ErrorPageProps } from './error';
import './globals.css';

/** Replaces the root layout when it fails, so it brings its own html, body and title. */
export default function GlobalError({ retry }: ErrorPageProps) {
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
