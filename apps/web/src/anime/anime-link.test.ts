import { describe, expect, it } from 'vitest';
import { animeLink } from './anime-link';

const page = (href: string) => ({ href, rel: undefined });
const idRoute = (href: string) => ({ href, rel: 'nofollow' });

describe('animeLink', () => {
  it('opens an imported anime on its slug, followed, on the same tab', () => {
    const imported = { anilistId: 20958, slug: 'aot-season-2', imported: true };
    expect(animeLink(imported)).toEqual(page('/anime/aot-season-2'));
    expect(animeLink(imported, '')).toEqual(page('/anime/aot-season-2'));
    expect(animeLink(imported, 'cast')).toEqual(
      page('/anime/aot-season-2/cast'),
    );
  });

  it('encodes the slug', () => {
    expect(animeLink({ anilistId: 1, slug: 'a b', imported: true })).toEqual(
      page('/anime/a%20b'),
    );
  });

  it('sends a claimed but never-imported slug through the nofollow id route', () => {
    const claimed = { anilistId: 20958, slug: 'aot-season-2', imported: false };
    expect(animeLink(claimed)).toEqual(idRoute('/anime/anilist/20958'));
    expect(animeLink(claimed, 'episodes')).toEqual(
      idRoute('/anime/anilist/20958/episodes'),
    );
  });

  it('reads a missing flag (older API) as not imported', () => {
    const legacy = { anilistId: 19, slug: 'monster' };
    expect(animeLink(legacy)).toEqual(idRoute('/anime/anilist/19'));
    expect(animeLink(legacy, 'stats')).toEqual(
      idRoute('/anime/anilist/19/stats'),
    );
  });

  it('never links a null slug, even when flagged imported', () => {
    const noSlug = { anilistId: 19, slug: null, imported: true };
    expect(animeLink(noSlug)).toEqual(idRoute('/anime/anilist/19'));
    expect(animeLink(noSlug, 'music')).toEqual(
      idRoute('/anime/anilist/19/music'),
    );
    expect(animeLink({ anilistId: 19, slug: null })).toEqual(
      idRoute('/anime/anilist/19'),
    );
  });
});
