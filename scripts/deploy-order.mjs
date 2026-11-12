// CI guard (OTA-183): web (Vercel) and API (Railway) deploy separately, so a PR that changes both
// and touches the shared contract needs a safe order. Warning only: always exits 0.
import { readFileSync, realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const DEPLOY_ORDER_MESSAGE =
  'web and API deploy separately; make the API change backward compatible, or split into two PRs (API first)';

const CONTROLLER = /^apps\/api\/src\/.+\.controller\.ts$/;

/** Returns the warning message when the changed paths mix web and API and touch the contract, else null. */
export function deployOrderWarning(changedPaths) {
  const touchesApi = changedPaths.some((p) => p.startsWith('apps/api/'));
  const touchesWeb = changedPaths.some((p) => p.startsWith('apps/web/'));
  const touchesContract = changedPaths.some(
    (p) => p.startsWith('packages/shared-types/') || CONTROLLER.test(p),
  );
  return touchesApi && touchesWeb && touchesContract
    ? DEPLOY_ORDER_MESSAGE
    : null;
}

function annotation(message) {
  return `::warning title=Deploy order::${message}`;
}

function main() {
  try {
    const paths = readFileSync(0, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    if (paths.length === 0) {
      process.stdout.write(
        `${annotation('no changed files listed, the guard did not run')}\n`,
      );
      return;
    }
    const message = deployOrderWarning(paths);
    if (message !== null) process.stdout.write(`${annotation(message)}\n`);
  } catch (error) {
    process.stdout.write(
      `${annotation(`the guard failed to run: ${String(error)}`)}\n`,
    );
  }
}

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
