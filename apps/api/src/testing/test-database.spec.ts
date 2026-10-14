import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import {
  clonePrefix,
  databaseName,
  testDatabaseUrl,
  withDatabase,
} from './test-database';

const TEST_URL = 'postgresql://user:pw@127.0.0.1:5432/otakuleague_test';
const DEV_URL = 'postgresql://user:pw@127.0.0.1:5432/otakuleague';

function enoent(): Error {
  return Object.assign(new Error('no such file'), { code: 'ENOENT' });
}

// The developer's repo-root .env must never leak into these tests: loadEnvFile is stubbed.
describe('testDatabaseUrl', () => {
  let loadEnvFile: MockInstance<typeof process.loadEnvFile>;

  beforeEach(() => {
    loadEnvFile = vi
      .spyOn(process, 'loadEnvFile')
      .mockImplementation(() => undefined);
    vi.stubEnv('DATABASE_URL', DEV_URL);
    vi.stubEnv('DATABASE_URL_TEST', TEST_URL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns DATABASE_URL_TEST when it names a *_test database distinct from DATABASE_URL', () => {
    expect(testDatabaseUrl().href).toBe(TEST_URL);
  });

  it('works without a .env file (CI) when the variable comes from the environment', () => {
    loadEnvFile.mockImplementation(() => {
      throw enoent();
    });

    expect(testDatabaseUrl().href).toBe(TEST_URL);
  });

  it('rethrows a .env read error other than a missing file', () => {
    loadEnvFile.mockImplementation(() => {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    });

    expect(() => testDatabaseUrl()).toThrow('permission denied');
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a URL', 'not a url'],
  ])('refuses a %s DATABASE_URL_TEST', (_label, value) => {
    vi.stubEnv('DATABASE_URL_TEST', value);

    expect(() => testDatabaseUrl()).toThrow(
      'DATABASE_URL_TEST is not set or not a URL',
    );
  });

  it.each(['x_test', 'otakuleague_2_test'])(
    'accepts the database name %s',
    (name) => {
      vi.stubEnv(
        'DATABASE_URL_TEST',
        `postgresql://u:p@127.0.0.1:5432/${name}`,
      );

      expect(databaseName(testDatabaseUrl())).toBe(name);
    },
  );

  it.each([
    'otakuleague',
    '_test',
    'otakuleague_test_copy',
    'Otakuleague_test',
    'otaku-league_test',
    'otakuleague_test/extra',
    `${'a'.repeat(41)}_test`,
    '',
  ])('refuses the database name "%s"', (name) => {
    vi.stubEnv('DATABASE_URL_TEST', `postgresql://u:p@127.0.0.1:5432/${name}`);

    expect(() => testDatabaseUrl()).toThrow(
      'DATABASE_URL_TEST must name a database matching [a-z0-9_]{1,40}_test.',
    );
  });

  it('refuses DATABASE_URL_TEST pointing at the same host and database as DATABASE_URL, even with other credentials', () => {
    vi.stubEnv('DATABASE_URL', TEST_URL);
    vi.stubEnv(
      'DATABASE_URL_TEST',
      'postgresql://other:creds@127.0.0.1:5432/otakuleague_test?sslmode=disable',
    );

    expect(() => testDatabaseUrl()).toThrow(
      'DATABASE_URL_TEST must differ from DATABASE_URL.',
    );
  });

  it.each([
    ['another port', 'postgresql://user:pw@127.0.0.1:5433/otakuleague_test'],
    ['another host', 'postgresql://user:pw@db:5432/otakuleague_test'],
    ['an unparsable value', 'not a url'],
  ])('accepts DATABASE_URL on %s', (_label, databaseUrl) => {
    vi.stubEnv('DATABASE_URL', databaseUrl);

    expect(testDatabaseUrl().href).toBe(TEST_URL);
  });

  it('accepts a missing DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', undefined);

    expect(testDatabaseUrl().href).toBe(TEST_URL);
  });
});

describe('withDatabase', () => {
  it('swaps only the database name and leaves the input untouched', () => {
    const template = new URL(`${TEST_URL}?sslmode=disable`);

    const clone = withDatabase(template, 'postgres');

    expect(clone.href).toBe(
      'postgresql://user:pw@127.0.0.1:5432/postgres?sslmode=disable',
    );
    expect(template.href).toBe(`${TEST_URL}?sslmode=disable`);
  });
});

describe('clonePrefix', () => {
  it('derives the disposable clone prefix from the template name', () => {
    expect(clonePrefix(new URL(TEST_URL))).toBe('otakuleague_test_file_');
  });
});
