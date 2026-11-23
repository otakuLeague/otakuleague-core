/**
 * An image URL safe to hand to the browser, or null: it must start with exactly "https://" (the
 * URL parser also accepts "https:/x" and "https:host", which browsers read differently) and
 * carry no credentials. Hosts are pinned by the API, not here.
 */
export function imageSrc(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !url.startsWith('https://')) return null;
  if (!URL.canParse(url)) return null;
  const { username, password } = new URL(url);
  return username === '' && password === '' ? url : null;
}
