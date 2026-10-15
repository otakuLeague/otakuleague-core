import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A recorded source response from ./fixtures (see its README), parsed fresh on each call. */
export function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(join(__dirname, 'fixtures', `${name}.json`), 'utf8'),
  );
}
