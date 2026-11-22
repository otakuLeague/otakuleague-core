import type { ThemeTag } from '../../../src/anime/overview-themes';

/** A theme tag with its relevance as a quiet percentage; plain text until tag browse routes exist. */
export function TagChip({ tag }: { readonly tag: ThemeTag }) {
  return (
    <span
      className={
        tag.visibility === 'spoiler'
          ? 'ol-chip ov-tag ov-tag--spoiler'
          : 'ol-chip ov-tag'
      }
    >
      {tag.name}
      <span className="ov-tag__rank">
        <span className="anime-sr-only">, relevance </span>
        {tag.rank}%
      </span>
    </span>
  );
}
