'use client';

import { useState } from 'react';
import type { ThemeTag } from '../../../src/anime/overview-themes';
import { TagChip } from './tag-chip';

/**
 * Spoiler tags behind a toggle: their names are not in the DOM until shown, so nothing (find
 * in page, a screen reader, a selection) reveals them by accident. Showing is instant.
 */
export function SpoilerTags({
  id,
  tags,
}: {
  readonly id: string;
  readonly tags: readonly ThemeTag[];
}) {
  const [state, setState] = useState<'hidden' | 'shown'>('hidden');
  const shown = state === 'shown';
  return (
    <div className="ov-spoilers" data-state={state}>
      <button
        type="button"
        className="ov-link-btn ov-spoiler-toggle"
        aria-expanded={shown}
        aria-controls={id}
        onClick={() => setState(shown ? 'hidden' : 'shown')}
      >
        {shown ? 'Hide spoiler tags' : `Show spoiler tags (${tags.length})`}
      </button>
      <div id={id}>
        {shown && (
          <ul className="ov-chips">
            {tags.map((tag) => (
              <li key={tag.name}>
                <TagChip tag={tag} spoiler />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
