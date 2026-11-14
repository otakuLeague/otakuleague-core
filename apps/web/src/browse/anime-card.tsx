import type { AnimeListCard } from '@otakuleague/shared-types';
import Image from 'next/image';
import Link from 'next/link';
import { animeLink } from '../anime/anime-link';
import { cardTitle, coverSrc } from '../home/home-rows';

/** A list card: cover and title. `h2` on list pages, `h3` under a section heading (home, Discover). */
export function AnimeCard({
  entry,
  headingLevel,
}: {
  readonly entry: AnimeListCard;
  readonly headingLevel: 'h2' | 'h3';
}) {
  const src = coverSrc(entry);
  const Heading = headingLevel;
  // An imported card links its page; any other goes through the nofollow id route, since a slug
  // is claimed before import (OTA-190) and following it would start a cold import (ADR 0018).
  const { href, rel } = animeLink(entry);
  return (
    <Link className="ol-anime-card" href={href} rel={rel} prefetch={false}>
      <div className="ol-anime-card__cover">
        {src !== null && (
          // Decorative: the title right below names the card.
          <Image src={src} alt="" width={176} height={264} />
        )}
      </div>
      <Heading className="ol-anime-card__title">{cardTitle(entry)}</Heading>
    </Link>
  );
}
