// Builds the sticky PR comment (ADR 0013) from the capture manifest. Pure: no I/O, no Playwright.
export const COMMENT_MARKER = '<!-- pr-screenshots -->';
export const IMAGE_BASE_PLACEHOLDER = '{{IMAGE_BASE}}';

/** One line, no mention can fire from a failure reason copied off a page. */
function plainReason(reason) {
  return String(reason).replace(/\s+/g, ' ').replaceAll('@', '').slice(0, 200);
}

function shotLine(shot) {
  const label = `${shot.width}px ${shot.scheme}`;
  if (shot.file === null) return `- ${label}: not captured (${plainReason(shot.error ?? 'unknown')})`;
  return `![${label}](${IMAGE_BASE_PLACEHOLDER}/${shot.file})`;
}

/** manifest: { routes: [{ name, path, shots: [{ width, scheme, file, error }] }], warnings: string[] } */
export function buildComment(manifest) {
  const lines = [COMMENT_MARKER, '## Screenshots of the real pages', ''];
  lines.push('Rendered by this PR\'s API and web builds from the recorded fixtures (ADR 0013). Updated on every push.', '');
  for (const route of manifest.routes) {
    lines.push(`### ${route.name} (\`${route.path}\`)`, '');
    const images = route.shots.filter((shot) => shot.file !== null).map(shotLine);
    const failures = route.shots.filter((shot) => shot.file === null).map(shotLine);
    if (images.length > 0) lines.push(images.join(' '), '');
    if (failures.length > 0) lines.push(failures.join('\n'), '');
  }
  if (manifest.warnings.length > 0) {
    lines.push('Warnings:', ...manifest.warnings.map((warning) => `- ${plainReason(warning)}`), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
