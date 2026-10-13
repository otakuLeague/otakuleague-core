import type { HealthResponse } from '@otakuleague/shared-types';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../src/api/client';
import { HealthStatus } from './health-status';

const getHealth = vi.fn<() => Promise<ApiResult<HealthResponse>>>();

vi.mock('../src/api/client', () => ({
  apiClient: () => ({ getHealth }),
}));

async function renderStatus(
  result: ApiResult<HealthResponse>,
): Promise<string> {
  getHealth.mockResolvedValueOnce(result);
  return render(await HealthStatus()).container.textContent;
}

describe('HealthStatus', () => {
  afterEach(() => {
    cleanup();
    getHealth.mockReset();
  });

  it('shows healthy when the API answers 200 with the database up', async () => {
    expect(
      await renderStatus({
        ok: true,
        data: { status: 'ok', checks: { database: 'up' } },
      }),
    ).toBe('All systems up: API and database.');
  });

  it('shows degraded when the API answers 503 with the database down', async () => {
    expect(
      await renderStatus({
        ok: true,
        data: { status: 'error', checks: { database: 'down' } },
      }),
    ).toBe('The API is up, but the database is down.');
  });

  it('shows unknown with "unreachable" when the API is down', async () => {
    expect(
      await renderStatus({ ok: false, failure: { kind: 'network' } }),
    ).toBe('Status unknown. The API is unreachable.');
  });

  it('shows unknown with "did not answer in time" on a timeout', async () => {
    expect(
      await renderStatus({ ok: false, failure: { kind: 'timeout' } }),
    ).toBe('Status unknown. The API did not answer in time.');
  });

  it('shows unknown on an invalid response', async () => {
    expect(
      await renderStatus({
        ok: false,
        failure: { kind: 'invalid_response', status: 502 },
      }),
    ).toBe('Status unknown. The API sent an unexpected answer.');
  });

  it('never shows the message of an API error envelope', async () => {
    const text = await renderStatus({
      ok: false,
      failure: {
        kind: 'api_error',
        status: 500,
        error: {
          error: { code: 'INTERNAL_ERROR', message: 'pg: password rejected' },
        },
      },
    });

    expect(text).toBe('Status unknown. The API sent an unexpected answer.');
    expect(document.body.textContent).not.toContain('pg: password rejected');
  });
});
