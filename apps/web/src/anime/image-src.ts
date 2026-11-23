/**
 * An image URL safe to hand to the browser, or null: it must start with exactly "https://" (the
 * URL parser also accepts "https:/x" and "https:host", which browsers read differently), carry no credentials or port, and be
 * in the parser's canonical form (`href` equals the text). Hosts are pinned by the API, not here.
 */
export function imageSrc(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !url.startsWith('https://')) return null;
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  return parsed.username === '' &&
    parsed.password === '' &&
    parsed.port === '' &&
    parsed.href === url
    ? url
    : null;
}
