import { CONTACT_EMAIL } from '../shell/site-footer';
import type { LegalDocument } from './legal-document';
import { LegalTable } from './legal-page';

// Credits every source in use (ADR 0006 and its OTA-92 update): AniList first, MyAnimeList
// through Jikan, AnimeThemes. Never "authorized by MyAnimeList": that needs MAL's written
// authorization (OTA-127). Images are hotlinked with attribution, never re-hosted.
export const DATA_SOURCES: LegalDocument = {
  path: '/data-sources',
  title: 'Data sources',
  description:
    'Where the anime information on OtakuLeague comes from, who owns it, and how to report a mistake.',
  lastUpdated: '2026-11-12',
  summary: [
    'Anime information on OtakuLeague comes from AniList, with MyAnimeList (through Jikan) filling gaps and AnimeThemes for openings and endings.',
    'Cover images belong to their rights holders and load from the sources’ servers.',
    'Your list, scores and XP stay on OtakuLeague and are never sent to our data sources.',
  ],
  sections: [
    {
      id: 'sources',
      title: 'Where our anime data comes from',
      body: (
        <>
          <p>
            We do not write anime information ourselves. It comes from the
            sources below, through their public APIs. AniList comes first;
            another source only fills what AniList lacks, and values from two
            sources are never mixed.
          </p>
          <LegalTable
            caption="Sources"
            columns={['Source', 'What we show', 'Terms']}
            rows={[
              [
                <a key="n" href="https://anilist.co">
                  AniList
                </a>,
                'Titles, synopses, format, episodes, dates, season, status, studios, genres, scores, rankings, popularity, favourites, airing times, seasons of a series and cover images',
                <a key="t" href="https://docs.anilist.co/guide/terms-of-use">
                  AniList API terms
                </a>,
              ],
              [
                <span key="n">
                  <a href="https://myanimelist.net">MyAnimeList</a>, through{' '}
                  <a href="https://jikan.moe">Jikan</a>
                </span>,
                'Details AniList does not have, and cover images when AniList has none',
                <a key="t" href="https://myanimelist.net/about/terms_of_use">
                  MyAnimeList terms of use
                </a>,
              ],
              [
                <a key="n" href="https://animethemes.moe">
                  AnimeThemes
                </a>,
                'Openings and endings: song titles and artists',
                <a
                  key="t"
                  href="https://animethemes.moe/about/terms-of-service"
                >
                  AnimeThemes terms of service
                </a>,
              ],
            ]}
          />
        </>
      ),
    },
    {
      id: 'images',
      title: 'Images',
      body: (
        <p>
          Cover images are the property of the anime’s studios, publishers and
          other rights holders. We do not copy them: your browser loads them
          from AniList’s servers, or MyAnimeList’s when AniList has none. If you
          own an image and want it removed, write to us.
        </p>
      ),
    },
    {
      id: 'ours',
      title: 'What is ours',
      body: (
        <p>
          Member lists, scores, XP, levels and leaderboards are built on
          OtakuLeague. We never send your activity to AniList, MyAnimeList,
          AnimeThemes or any other data source.
        </p>
      ),
    },
    {
      id: 'mistakes',
      title: 'Spotted a mistake?',
      body: (
        <p>
          Our information is only as good as the source’s. If something is wrong
          or missing, tell us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>; when the
          mistake is in the source, the fastest fix is to correct it on that
          source itself.
        </p>
      ),
    },
  ],
};
