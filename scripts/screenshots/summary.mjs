// Builds the capture job summary (ADR 0013): what was captured, why a shot is missing, warnings.
// Pure: no I/O, no Playwright. The PR comment links to it; it is built in publish from file names.

/** One line, no mention can fire from a failure reason copied off a page. */
function plainReason(reason) {
  return String(reason).replace(/\s+/g, ' ').replaceAll('@', '').slice(0, 200);
}

/** manifest: { routes: [{ name, path, shots: [{ width, scheme, file, error }] }], warnings: string[] } */
export function buildSummary(manifest) {
  const shots = manifest.routes.flatMap((route) => route.shots);
  const captured = shots.filter((shot) => shot.file !== null).length;
  const missing = manifest.routes.flatMap((route) => {
    const failed = route.shots.filter((shot) => shot.file === null);
    if (failed.length === 0) return [];
    return [
      `- ${route.name} (\`${route.path}\`):`,
      ...failed.map(
        (shot) =>
          `  - ${shot.width}px ${shot.scheme}: not captured (${plainReason(shot.error ?? 'unknown')})`,
      ),
    ];
  });
  const lines = [
    '## Screenshots',
    '',
    `${captured} of ${shots.length} captured (artifact \`pr-screenshots\`).`,
  ];
  if (missing.length > 0) lines.push('', ...missing);
  if (manifest.warnings.length > 0) {
    lines.push(
      '',
      'Warnings:',
      ...manifest.warnings.map((warning) => `- ${plainReason(warning)}`),
    );
  }
  return `${lines.join('\n')}\n`;
}
