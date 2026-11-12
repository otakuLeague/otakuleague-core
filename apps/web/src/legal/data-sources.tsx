import { CONTACT_EMAIL } from '../shell/site-footer';
import type { LegalDocument } from './legal-document';
import { LegalTable } from './legal-page';

// Credits only sources in use today (ADR 0006 is still proposed): AniList. MyAnimeList and
// AnimeThemes are added here once their use is approved.
export const DATA_SOURCES: LegalDocument = {
  path: '/data-sources',
  title: 'Data sources',
  description:
    'Where the anime information on OtakuLeague comes from, who owns it, and how to report a mistake.',
  lastUpdated: '2026-11-12',
  summary: [
    'Anime information on OtakuLeague comes from AniList.',
    'Cover images belong to their rights holders and load from AniList’s servers.',
    'Your list, scores and XP stay on OtakuLeague and are never sent to AniList.',
  ],
  sections: [
    {
      id: 'sources',
      title: 'Where our anime data comes from',
      body: (
        <>
          <p>
            We do not write anime information ourselves. It comes from the
            source below, through its public API.
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
          from AniList’s servers. If you own an image and want it removed, write
          to us.
        </p>
      ),
    },
    {
      id: 'ours',
      title: 'What is ours',
      body: (
        <p>
          Member lists, scores, XP, levels and leaderboards are built on
          OtakuLeague. We never send your activity to AniList or any other data
          source.
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
          mistake is in the source, the fastest fix is to correct it on AniList
          itself.
        </p>
      ),
    },
  ],
};
