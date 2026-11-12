import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AniListAdapter, type ListQuery } from './anilist.adapter';
import { fixture } from './fixtures';
import { record } from './parse';
import { AnimeSourceSettings, type SourceSettings } from './source-settings';
import { SourceUnavailableError, UnusableAnswerError } from './source.types';

describe('AniListAdapter.fetchList', () => {
  let server: Server;
  let variablesSeen: Record<string, unknown>[];
  let respond: (res: import('node:http').ServerResponse) => void;

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
  const airing: ListQuery = { sort: ['POPULARITY_DESC'], status: 'RELEASING' };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        variablesSeen.push(
          record(record(JSON.parse(raw) as unknown).variables),
        );
        respond(res);
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
  });

  beforeEach(() => {
    variablesSeen = [];
    respond = (res) =>
      void res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(record(fixture('lists/anilist-airing')).response));
  });

  afterAll(() => {
    server.close();
  });

  it('asks for one page with the list sort and status, and maps it', async () => {
    const block = await adapter().fetchList(airing, 2, 'visitor');

    expect(variablesSeen).toEqual([{ page: 2, perPage: 50, ...airing }]);
    expect(block.entries).toHaveLength(3);
    expect(block.hasNextPage).toBe(true);
  });

  it('omits the status of a list without one', async () => {
    await adapter().fetchList({ sort: ['SCORE_DESC'] }, 1, 'visitor');

    expect(variablesSeen).toEqual([
      { page: 1, perPage: 50, sort: ['SCORE_DESC'] },
    ]);
  });

  it('fails and cools down on an HTTP error', async () => {
    respond = (res) => void res.writeHead(500).end();
    const source = adapter(0, 60_000);

    await expect(source.fetchList(airing, 1, 'visitor')).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
    expect(source.isDown()).toBe(true);
  });

  it('fails without cooling down when the answer has no usable Page', async () => {
    respond = (res) =>
      void res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ errors: [{ message: 'boom' }], data: null }));
    const source = adapter(0, 60_000);

    await expect(source.fetchList(airing, 1, 'visitor')).rejects.toBeInstanceOf(
      UnusableAnswerError,
    );
    expect(source.isDown()).toBe(false);
  });

  it('refuses a Page that arrives with GraphQL errors', async () => {
    respond = (res) =>
      void res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          ...record(record(fixture('lists/anilist-airing')).response),
          errors: [{ message: 'partial' }],
        }),
      );

    await expect(adapter().fetchList(airing, 1, 'visitor')).rejects.toThrow(
      /trustworthy/,
    );
  });

  it('a background fetch takes only a free slot, without cooling down', async () => {
    const source = adapter(60_000);
    await source.fetchList(airing, 1, 'visitor');

    await expect(
      source.fetchList(airing, 2, 'background'),
    ).rejects.toMatchObject({ reason: 'queue full' });
    expect(source.isDown()).toBe(false);
    expect(variablesSeen).toHaveLength(1);
  });
});
