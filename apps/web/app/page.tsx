import { APP_NAME } from '@otakuleague/shared-types';
import { Suspense } from 'react';
import { HealthStatus } from './health-status';

export default function Home() {
  return (
    <main>
      <h1>{APP_NAME}</h1>
      <h2>Service status</h2>
      {/* The live region wraps Suspense, so screen readers announce the swap from the fallback. */}
      <div role="status">
        <Suspense fallback={<p>Checking the API…</p>}>
          <HealthStatus />
        </Suspense>
      </div>
    </main>
  );
}
