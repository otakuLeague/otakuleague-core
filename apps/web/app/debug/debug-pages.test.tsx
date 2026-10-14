import { notFound } from 'next/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClientErrorPage from './client-error/page';
import ServerErrorPage from './server-error/page';

// The real notFound() also throws; this sentinel makes "404" assertable without Next internals.
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

const PAGES = [
  ['/debug/server-error', ServerErrorPage],
  ['/debug/client-error', ClientErrorPage],
] as const;

describe('debug pages', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe.each(['production', 'staging'])('NODE_ENV=%s', (nodeEnv) => {
    it.each(PAGES)('%s is a 404', (_route, Page) => {
      vi.stubEnv('NODE_ENV', nodeEnv);

      expect(() => Page()).toThrow('NEXT_NOT_FOUND');
      expect(notFound).toHaveBeenCalledOnce();
    });
  });

  describe.each(['development', 'test'])('NODE_ENV=%s', (nodeEnv) => {
    it('/debug/server-error throws the deliberate error', () => {
      vi.stubEnv('NODE_ENV', nodeEnv);

      expect(() => ServerErrorPage()).toThrow('Deliberate test error');
      expect(notFound).not.toHaveBeenCalled();
    });

    it('/debug/client-error renders the button', () => {
      vi.stubEnv('NODE_ENV', nodeEnv);

      expect(ClientErrorPage()).toBeTruthy();
      expect(notFound).not.toHaveBeenCalled();
    });
  });
});
