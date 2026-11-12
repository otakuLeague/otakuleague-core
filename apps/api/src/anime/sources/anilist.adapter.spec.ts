import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AniListAdapter } from './anilist.adapter';
import { fixture } from './fixtures';
import { record } from './parse';
import { AnimeSourceSettings, type SourceSettings } from './source-settings';
import { SourceUnavailableError } from './source.types';

/** Every node of every recorded Attack on Titan walk level, by AniList id. */
const AOT_NODES = new Map(
  (fixture('anilist-walk-attack-on-titan') as unknown[]).flatMap((level) =>
    (
      record(record(record(record(level).response).data).Page)
        .media as unknown[]
    ).map((media) => [record(media).id, media] as const),
  ),
);

describe('AniListAdapter.fetchRelations', () => {
  let server: Server;
  let requests: { ids: number[]; perPage: unknown }[];
  let status: number;
  let graphqlError: boolean;
  let hasNextPage: boolean;
  let partialError: boolean;

  const adapter = (minIntervalMs = 0, coolDownMs = 0) =>
    new AniListAdapter(
      new (class extends AnimeSourceSettings {
        get(): SourceSettings {
          return {
            enabled: true,
            baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
            minIntervalMs,
            timeoutMs: 2_000,
            maxRetryAfterMs: 1_000,
            coolDownMs,
            maxQueueMs: 5_000,
          };
        }
      })(),
    );

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        const variables = record(record(JSON.parse(raw) as unknown).variables);
        const ids = (variables.ids as number[] | undefined) ?? [];
        requests.push({ ids, perPage: variables.perPage });
        const media = ids.flatMap((id) => AOT_NODES.get(id) ?? []);
        res.writeHead(status, { 'Content-Type': 'application/json' }).end(
          JSON.stringify(
            graphqlError
              ? { errors: [{ message: 'Internal Server Error' }], data: null }
              : {
                  ...(partialError && { errors: [{ message: 'Not Found.' }] }),
                  data:
                    status === 200
                      ? { Page: { pageInfo: { hasNextPage }, media } }
                      : null,
                },
          ),
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
  });

  beforeEach(() => {
    requests = [];
    status = 200;
    graphqlError = false;
    hasNextPage = false;
    partialError = false;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('asks for all the ids in one request, and omits ids AniList does not know', async () => {
    const nodes = await adapter().fetchRelations([16498, 20958, 900_000]);

    expect(requests).toEqual([{ ids: [16498, 20958, 900_000], perPage: 50 }]);
    expect(nodes.map(({ anilistId }) => anilistId)).toEqual([16498, 20958]);
  });

  it('refuses no ids or more than one page of ids, without a request', async () => {
    const tooMany = Array.from({ length: 51 }, (_, index) => index + 1);

    await expect(adapter().fetchRelations([])).rejects.toThrow(RangeError);
    await expect(adapter().fetchRelations(tooMany)).rejects.toThrow(RangeError);
    expect(requests).toEqual([]);
  });

  it('fails as unavailable and cools down when AniList truncated the page', async () => {
    hasNextPage = true;
    const walker = adapter(0, 60_000);

    await expect(walker.fetchRelations([16498])).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
    expect(walker.isDown()).toBe(true);
  });

  it('fails as unavailable and cools down when the answer has no Page', async () => {
    status = 404;
    const walker = adapter(0, 60_000);

    await expect(walker.fetchRelations([16498])).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
    expect(walker.isDown()).toBe(true);
  });

  it('fails as unavailable and cools down on a GraphQL error answered with HTTP 200', async () => {
    graphqlError = true;
    const walker = adapter(0, 60_000);

    await expect(walker.fetchRelations([16498])).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
    expect(walker.isDown()).toBe(true);
  });

  it('accepts a GraphQL error next to a usable Page', async () => {
    partialError = true;

    const nodes = await adapter().fetchRelations([16498]);

    expect(nodes.map(({ anilistId }) => anilistId)).toEqual([16498]);
  });

  it('gives up instead of queueing behind another request', async () => {
    const busy = adapter(60_000);
    await busy.fetchRelations([16498]);

    await expect(busy.fetchRelations([20958])).rejects.toThrow('queue full');
    expect(requests).toHaveLength(1);
  });

  it('lets a background fetchAnime take only a free slot, never queue', async () => {
    const busy = adapter(1_000);
    await busy.fetchRelations([16498]);

    await expect(
      busy.fetchAnime({ source: 'anilist', externalId: 16498 }, 'background'),
    ).rejects.toThrow('queue full');
    expect(requests).toHaveLength(1);
  });
});
