# Common-password list

Sign-up refuses a password on this list (ADR 0020, Addendum (1e-iii)). `isCommonPassword` in `../common-passwords.ts` is the only reader.

- Source: SecLists, `Passwords/Common-Credentials/10k-most-common.txt` (https://github.com/danielmiessler/SecLists), branch `master`.
- Licence: MIT, Copyright (c) 2018 Daniel Miessler. The notice is kept verbatim in `LICENSE` beside this file and must stay with the copy.
- Fetched: 2026-11-20.
- SHA-256 of the upstream file: `68782d6a4a19a4768d5f15dd66bd534e7a33055cc755411e33f16d18c50fdcce`. `common-passwords.spec.ts` rebuilds the file's bytes from the array (`entries.join('\n') + '\n'`) and pins this hash.
- 10,001 entries (not 10,000), all lower-case ASCII, no duplicate.
- Converted to a TypeScript array, entries unchanged: `common-passwords.data.ts` is written by a command, never by hand.

## Regenerate

From the repo root, with the upstream file at `<list>`:

```sh
node -e 'const fs=require("fs");const e=fs.readFileSync(process.argv[1],"utf8").split("\n");if(e.pop()!=="")throw new Error("no final newline");fs.writeFileSync(process.argv[2],"// Generated from SecLists Passwords/Common-Credentials/10k-most-common.txt (MIT, see LICENSE and\n// README.md beside this file): entries and order unchanged. Never edit by hand; regenerate instead.\nexport const COMMON_PASSWORDS: readonly string[] = "+JSON.stringify(e,null,2)+";\n")' <list> apps/api/src/auth/common-passwords/common-passwords.data.ts
pnpm exec prettier --write apps/api/src/auth/common-passwords/common-passwords.data.ts
```

Prettier only changes the quotes. A new upstream version changes the hash: update it here, in the spec and in ADR 0020 in the same PR, after checking the licence again (ADR 0006).
