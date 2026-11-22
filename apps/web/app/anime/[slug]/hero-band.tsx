import Image from 'next/image';

/**
 * The band at the top of the header: AniList's banner when the anime has one, else the dot grid.
 * Decorative (hidden from assistive tech, empty alt). Served as-is from AniList's CDN
 * (images.unoptimized: never stored or resized here). Eager with the default fetch priority
 * (it is above the fold); only the cover carries the high-priority hint. LCP not measured yet.
 */
export function HeroBand({ bannerUrl }: { readonly bannerUrl: string | null }) {
  if (bannerUrl === null) {
    return <div className="anime-hero__band" aria-hidden="true" />;
  }
  return (
    <div
      className="anime-hero__band anime-hero__band--banner"
      aria-hidden="true"
    >
      <Image
        className="anime-hero__banner"
        src={bannerUrl}
        alt=""
        fill
        sizes="100vw"
        loading="eager"
      />
    </div>
  );
}
