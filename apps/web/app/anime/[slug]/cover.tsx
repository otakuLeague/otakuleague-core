import Image from 'next/image';

/**
 * The cover, 2:3 with the accent glow; the title's initials on a placeholder when AniList has
 * no image. Served as-is from AniList's CDN (images.unoptimized: never stored or resized here).
 */
export function Cover({
  url,
  title,
  initials,
  size,
}: {
  readonly url: string | null;
  readonly title: string;
  readonly initials: string;
  readonly size: 'hero' | 'mini';
}) {
  const className = `anime-cover anime-cover--${size}`;
  if (url === null) {
    return (
      <div
        className={`${className} anime-cover--empty`}
        // The mini one is decorative like the mini image (alt=""): the title sits next to it.
        {...(size === 'hero'
          ? { role: 'img', 'aria-label': 'No cover available' }
          : { 'aria-hidden': true })}
      >
        {size === 'hero' && <span aria-hidden="true">{initials}</span>}
      </div>
    );
  }
  const [width, height] = size === 'hero' ? [216, 324] : [34, 48];
  return (
    <Image
      className={className}
      src={url}
      alt={size === 'hero' ? `${title} cover` : ''}
      width={width}
      height={height}
      loading={size === 'hero' ? 'eager' : 'lazy'}
      fetchPriority={size === 'hero' ? 'high' : undefined}
    />
  );
}
