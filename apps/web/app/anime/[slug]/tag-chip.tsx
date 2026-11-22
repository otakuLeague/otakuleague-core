import type { ThemeTag } from '../../../src/anime/overview-themes';

/** A theme tag with its relevance as a quiet percentage; plain text until tag browse routes exist. */
export function TagChip({
  tag,
  spoiler = false,
}: {
  readonly tag: ThemeTag;
  readonly spoiler?: boolean;
}) {
  return (
    <span
      className={spoiler ? 'ol-chip ov-tag ov-tag--spoiler' : 'ol-chip ov-tag'}
    >
      <bdi>{tag.name}</bdi>
      <span className="ov-tag__rank">
        <span className="anime-sr-only">, relevance </span>
        {tag.rank}%
      </span>
    </span>
  );
}
