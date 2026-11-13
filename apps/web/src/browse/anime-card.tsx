import type { AnimeListCard } from '@otakuleague/shared-types';
import Image from 'next/image';
import Link from 'next/link';
import { cardHref, cardTitle, coverSrc } from '../home/home-rows';

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
  return (
    // nofollow on every card until OTA-189/OTA-191: slugs are claimed before import (OTA-190), so
    // a crawler following /anime/<slug> would trigger a cold import, like /anime/anilist/<id>.
    <Link
      className="ol-anime-card"
      href={cardHref(entry)}
      rel="nofollow"
      prefetch={false}
    >
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
