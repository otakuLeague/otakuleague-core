/**
 * Real titles and synonyms as AniList lists them, for the ranking table of ADR 0016.
 * Season 2 comes before season 1 on purpose: popularity, not insertion order, must rank them.
 * `slug` null: an anime with no identity row (not yet claimed).
 */
export interface SearchSeedAnime {
  readonly anilistId: number;
  readonly slug: string | null;
  readonly english: string | null;
  readonly romaji: string;
  readonly native: string | null;
  readonly synonyms: readonly string[];
  readonly members: number;
}

export const SEARCH_SEED: readonly SearchSeedAnime[] = [
  {
    anilistId: 25777,
    slug: 'attack-on-titan-season-2',
    english: 'Attack on Titan Season 2',
    romaji: 'Shingeki no Kyojin Season 2',
    native: '進撃の巨人 Season2',
    synonyms: ['AoT S2', 'SnK S2'],
    members: 2_300_000,
  },
  {
    anilistId: 16498,
    slug: 'attack-on-titan',
    english: 'Attack on Titan',
    romaji: 'Shingeki no Kyojin',
    native: '進撃の巨人',
    synonyms: ['AoT', 'SnK'],
    members: 3_600_000,
  },
  {
    anilistId: 113415,
    slug: 'jujutsu-kaisen',
    english: 'JUJUTSU KAISEN',
    romaji: 'Jujutsu Kaisen',
    native: '呪術廻戦',
    synonyms: ['JJK'],
    members: 2_100_000,
  },
  {
    anilistId: 5114,
    slug: 'fullmetal-alchemist-brotherhood',
    english: 'Fullmetal Alchemist: Brotherhood',
    romaji: 'Hagane no Renkinjutsushi: FULLMETAL ALCHEMIST',
    native: '鋼の錬金術師 FULLMETAL ALCHEMIST',
    synonyms: ['FMAB', 'Fullmetal Alchemist (2009)'],
    members: 3_200_000,
  },
  {
    anilistId: 21355,
    slug: 're-zero-starting-life-in-another-world',
    english: 'Re:ZERO -Starting Life in Another World-',
    romaji: 'Re:Zero kara Hajimeru Isekai Seikatsu',
    native: 'Re:ゼロから始める異世界生活',
    synonyms: ['ReZero', 'Re: Zero'],
    members: 1_900_000,
  },
  {
    anilistId: 11061,
    slug: 'hunter-x-hunter-2011',
    english: 'Hunter x Hunter (2011)',
    romaji: 'HUNTER×HUNTER (2011)',
    native: 'HUNTER×HUNTER (2011)',
    synonyms: ['HxH'],
    members: 2_500_000,
  },
  {
    anilistId: 14719,
    slug: 'jojos-bizarre-adventure',
    english: "JoJo's Bizarre Adventure",
    romaji: 'JoJo no Kimyou na Bouken',
    native: 'ジョジョの奇妙な冒険',
    synonyms: ['JoJo'],
    members: 1_300_000,
  },
  {
    anilistId: 116589,
    slug: '86-eighty-six',
    english: '86 EIGHTY-SIX',
    romaji: '86: Eighty Six',
    native: '86―エイティシックス―',
    synonyms: ['86'],
    members: 700_000,
  },
  {
    anilistId: 13601,
    slug: 'k',
    english: 'K',
    romaji: 'K',
    native: 'K',
    synonyms: ['K Project'],
    members: 600_000,
  },
  {
    anilistId: 527,
    slug: 'pokemon',
    english: 'Pokémon',
    romaji: 'Pocket Monsters',
    native: 'ポケットモンスター',
    synonyms: ['Pokemon: Indigo League'],
    members: 400_000,
  },
  {
    anilistId: 1535,
    slug: 'death-note',
    english: 'Death Note',
    romaji: 'DEATH NOTE',
    native: 'デスノート',
    synonyms: [],
    members: 4_000_000,
  },
  {
    anilistId: 154587,
    slug: 'frieren-beyond-journeys-end',
    english: "Frieren: Beyond Journey's End",
    romaji: 'Sousou no Frieren',
    native: '葬送のフリーレン',
    synonyms: ['Frieren at the Funeral'],
    members: 1_100_000,
  },
  {
    anilistId: 1,
    slug: 'cowboy-bebop',
    english: 'Cowboy Bebop',
    romaji: 'Cowboy Bebop',
    native: 'カウボーイビバップ',
    synonyms: [],
    members: 1_800_000,
  },
  {
    anilistId: 20,
    slug: null,
    english: 'Naruto',
    romaji: 'NARUTO',
    native: 'ナルト',
    synonyms: [],
    members: 3_000_000,
  },
];
