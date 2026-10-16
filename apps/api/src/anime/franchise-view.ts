import type { AnimeStatus, PartialDate } from '@otakuleague/shared-types';
import { isFollowedEdge, type Traversal } from './franchise-graph';
import type {
  MediaRelation,
  MediaSummary,
  RelationNode,
} from './sources/source.types';

/**
 * The franchise of one anime, computed at read time from the walked rows (ADR 0008 items
 * 4-7). Pure: the endpoint loads the rows, overrides and removed identities, and adds slugs.
 */

export interface FranchiseOverride {
  readonly role: 'SEASON' | 'RELATED' | 'BOUNDARY' | null;
  readonly label: string | null;
}

export interface FranchiseInput {
  readonly startId: number;
  /** traverseFranchise from startId over the stored rows. */
  readonly traversal: Traversal;
  /** Every BOUNDARY id in the database: the set the traversal used, not only its entries'. */
  readonly boundaries: ReadonlySet<number>;
  /** Overrides of the traversed entries (at least). */
  readonly overrides: ReadonlyMap<number, FranchiseOverride>;
  /**
   * Removed identities (ADR 0007) among the traversed entries and the targets of their
   * edges: none of them is ever shown.
   */
  readonly removed: ReadonlySet<number>;
}

/** `walking`: an entry of the franchise has no row yet; `truncated`: the node cap cut it. */
export type FranchiseState = 'complete' | 'walking' | 'truncated';

export interface FranchiseEntry {
  readonly anilistId: number;
  readonly mediaType: MediaSummary['mediaType'];
  readonly format: MediaSummary['format'];
  readonly status: AnimeStatus | null;
  readonly startDate: PartialDate | null;
  /** English, else romaji. */
  readonly title: string;
  readonly coverImageUrl: string | null;
}

export interface MainLineEntry extends FranchiseEntry {
  readonly label: string;
  readonly isCurrent: boolean;
}

const RELATED_GROUPS = [
  'movie',
  'ova',
  'special',
  'ona',
  'tv',
  'music',
  'spin_off',
  'source',
  'other',
] as const;
export type RelatedGroupName = (typeof RELATED_GROUPS)[number];

export interface RelatedGroup {
  readonly group: RelatedGroupName;
  /** At most RELATED_LIMIT, by air date. */
  readonly entries: readonly FranchiseEntry[];
  readonly total: number;
}

export interface FranchiseView {
  readonly state: FranchiseState;
  readonly mainLine: readonly MainLineEntry[];
  readonly related: readonly RelatedGroup[];
}

/** Entries per Related group (ADR 0008 item 9). */
const RELATED_LIMIT = 50;

const SEASON_FORMATS: ReadonlySet<MediaSummary['format']> = new Set([
  'TV',
  'TV_SHORT',
  'ONA',
]);
const SPIN_OFF_RELATIONS: ReadonlySet<MediaRelation> = new Set([
  'SPIN_OFF',
  'ALTERNATIVE',
  'CHARACTER',
  'OTHER',
]);
const ORDINALS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];
const ORDINAL_SEASON = new RegExp(
  `\\b(${ORDINALS.join('|')})\\s+season\\b`,
  'i',
);

const STATES: Readonly<Record<Traversal['state'], FranchiseState>> = {
  complete: 'complete',
  truncated: 'truncated',
  // Stored rows only: an entry without a row is still to be walked.
  missing: 'walking',
  stopped: 'walking',
};

export function buildFranchise(input: FranchiseInput): FranchiseView {
  const members = input.traversal.nodes.filter(
    ({ anilistId }) => !input.removed.has(anilistId),
  );
  const seasons = members
    .filter((node) => isSeason(node, input.overrides.get(node.anilistId)))
    .toSorted(byAirDate);
  return {
    state:
      input.traversal.nodes.length === 0
        ? 'walking'
        : STATES[input.traversal.state],
    mainLine: labelled(seasons, input),
    related: relatedGroups(members, seasons, input),
  };
}

function isSeason(
  node: RelationNode,
  override: FranchiseOverride | undefined,
): boolean {
  if (override?.role === 'SEASON') return true;
  if (override?.role === 'RELATED') return false;
  return SEASON_FORMATS.has(node.format) && node.status !== 'CANCELLED';
}

/** Start date, unknown parts last, then AniList id: unaired entries with no date end the list. */
function byAirDate(a: MediaSummary, b: MediaSummary): number {
  const key = ({ startDate }: MediaSummary) => [
    startDate?.year ?? Number.MAX_SAFE_INTEGER,
    startDate?.month ?? 13,
    startDate?.day ?? 32,
  ];
  const [ka, kb] = [key(a), key(b)];
  const diff = ka.findIndex((part, index) => part !== kb[index]);
  return diff === -1 ? a.anilistId - b.anilistId : ka[diff]! - kb[diff]!;
}

function titleOf(summary: MediaSummary): string {
  return (
    summary.titleEnglish ??
    summary.titleRomaji ??
    `AniList ${summary.anilistId}`
  );
}

function entryOf(summary: MediaSummary): FranchiseEntry {
  return {
    anilistId: summary.anilistId,
    mediaType: summary.mediaType,
    format: summary.format,
    status: summary.status,
    startDate: summary.startDate,
    title: titleOf(summary),
    coverImageUrl: summary.coverImageUrl,
  };
}

/**
 * "Season 2", "Final Season", "Season 3 Part 2"... from a title that says so (numbers,
 * "2nd", "Second"; no Roman numerals: too ambiguous); null when it names no season.
 */
export function seasonLabelFromTitle(title: string): string | null {
  const numbered =
    /\bseason\s+(\d+)\b/i.exec(title)?.[1] ??
    /\b(\d+)(?:st|nd|rd|th)\s+season\b/i.exec(title)?.[1];
  const ordinal = ORDINAL_SEASON.exec(title)?.[1]?.toLowerCase();
  const season =
    numbered !== undefined
      ? Number(numbered)
      : ordinal === undefined
        ? null
        : ORDINALS.indexOf(ordinal) + 1;
  const final = /\bfinal\s+season\b/i.test(title);
  if (!final && season === null) return null;
  const part = /\b(?:part|cour)\s+(\d+)\b/i.exec(title)?.[1];
  const name = final ? 'Final Season' : `Season ${season}`;
  return part === undefined ? name : `${name} Part ${Number(part)}`;
}

/**
 * ADR 0008 item 6. An override label wins. When no season title names a season, labels go
 * by position. Otherwise a title that names one gives its label, the first entry is
 * "Season 1", and any other keeps its title. Two entries with the same label show their
 * titles instead, with the year (or AniList id) if the titles are the same too.
 */
function labelled(
  seasons: readonly RelationNode[],
  input: FranchiseInput,
): MainLineEntry[] {
  const overrideLabel = (node: RelationNode) =>
    input.overrides.get(node.anilistId)?.label ?? null;
  const anyMarker = seasons.some(
    (node) =>
      overrideLabel(node) === null &&
      seasonLabelFromTitle(titleOf(node)) !== null,
  );
  // An override label is final and takes no position: the others are numbered around it.
  const fixed = seasons.map((node) => overrideLabel(node));
  let position = 0;
  const first = seasons.map((node, index) => {
    const fixedLabel = fixed[index];
    if (fixedLabel !== null && fixedLabel !== undefined) return fixedLabel;
    position += 1;
    const title = titleOf(node);
    if (!anyMarker) return `Season ${position}`;
    return seasonLabelFromTitle(title) ?? (position === 1 ? 'Season 1' : title);
  });
  const tally = (labels: readonly string[]) => {
    const counts = new Map<string, number>();
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
    return counts;
  };
  // Only computed labels give way on a clash: to the title, then the year, then the id.
  const giveWay = (
    labels: readonly string[],
    to: (index: number) => string,
  ) => {
    const counts = tally(labels);
    return labels.map((label, index) =>
      fixed[index] === null && (counts.get(label) ?? 0) > 1 ? to(index) : label,
    );
  };
  const byTitle = giveWay(first, (index) => titleOf(seasons[index]!));
  const byYear = giveWay(byTitle, (index) => {
    const year = seasons[index]!.startDate?.year;
    return year === undefined
      ? `${byTitle[index]} (${seasons[index]!.anilistId})`
      : `${byTitle[index]} (${year})`;
  });
  const unique = giveWay(
    byYear,
    (index) => `${byTitle[index]} (${seasons[index]!.anilistId})`,
  );
  return seasons.map((node, index) => ({
    ...entryOf(node),
    label: unique[index]!,
    isCurrent: node.anilistId === input.startId,
  }));
}

function formatGroup(format: MediaSummary['format']): RelatedGroupName {
  switch (format) {
    case 'TV':
    case 'TV_SHORT':
      return 'tv';
    case 'MOVIE':
      return 'movie';
    case 'OVA':
      return 'ova';
    case 'SPECIAL':
      return 'special';
    case 'ONA':
      return 'ona';
    case 'MUSIC':
      return 'music';
    default:
      return 'other';
  }
}

/**
 * ADR 0008 item 7: members that are not seasons (grouped by format), plus every target of a
 * non-followed edge of a member: manga is `source`, a spin-off, alternative, character or
 * other relation is `spin_off`, anything else goes by format. A target reached by several
 * edges takes the first group in that order.
 */
function relatedGroups(
  members: readonly RelationNode[],
  seasons: readonly RelationNode[],
  input: FranchiseInput,
): RelatedGroup[] {
  const memberIds = new Set(members.map(({ anilistId }) => anilistId));
  const seasonIds = new Set(seasons.map(({ anilistId }) => anilistId));
  const priority = (group: RelatedGroupName) =>
    group === 'source' ? 0 : group === 'spin_off' ? 1 : 2;
  const found = new Map<
    number,
    { summary: MediaSummary; group: RelatedGroupName }
  >();
  for (const member of members) {
    if (!seasonIds.has(member.anilistId)) {
      found.set(member.anilistId, {
        summary: member,
        group: formatGroup(member.format),
      });
    }
  }
  for (const member of members) {
    for (const edge of member.edges) {
      const { target } = edge;
      if (
        memberIds.has(target.anilistId) ||
        input.removed.has(target.anilistId) ||
        isFollowedEdge(member.anilistId, edge, input.boundaries)
      ) {
        continue;
      }
      const group: RelatedGroupName =
        target.mediaType === 'MANGA'
          ? 'source'
          : SPIN_OFF_RELATIONS.has(edge.relation)
            ? 'spin_off'
            : formatGroup(target.format);
      const known = found.get(target.anilistId);
      if (!known || priority(group) < priority(known.group)) {
        found.set(target.anilistId, { summary: target, group });
      }
    }
  }
  return RELATED_GROUPS.flatMap((group) => {
    const entries = [...found.values()]
      .filter((candidate) => candidate.group === group)
      .map(({ summary }) => summary)
      .toSorted(byAirDate);
    return entries.length === 0
      ? []
      : [
          {
            group,
            entries: entries.slice(0, RELATED_LIMIT).map(entryOf),
            total: entries.length,
          },
        ];
  });
}
