import {
  type AnimeStatus,
  FRANCHISE_RELATED_GROUPS,
  type FranchiseRelatedGroupName,
  type PartialDate,
} from '@otakuleague/shared-types';
import { isFollowedEdge, type Traversal } from './franchise-graph';
import type { BackoffStage } from './source-backoff';
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
  /** The backoff stage of each of traversal.missingIds (ADR 0008 item 11). */
  readonly missingStages: readonly BackoffStage[];
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

/** See stateOf. */
export type FranchiseState = 'complete' | 'walking' | 'partial' | 'truncated';

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

type RelatedGroupName = FranchiseRelatedGroupName;

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
const ROMAN_SEASONS = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
];
const NUMBERED_SEASON =
  /^(?:season\s+(\d+)|(\d+)(?:st|nd|rd|th)\s+season|(\d+))$/i;
const ORDINAL_SEASON = new RegExp(`^(${ORDINALS.join('|')})\\s+season$`, 'i');

/**
 * Missing ids: one still to fetch makes it `walking`; otherwise one AniList just left out
 * makes it `partial` (the page can say the list may be incomplete); ids left out again and
 * again (settled backoff) leave it `complete` without them. A cut by the node cap wins.
 */
function stateOf(
  traversal: Traversal,
  missingStages: readonly BackoffStage[],
): FranchiseState {
  switch (traversal.state) {
    case 'complete':
    case 'truncated':
      return traversal.state;
    case 'stopped':
      return 'walking';
    case 'missing':
      if (missingStages.includes('clear')) return 'walking';
      return missingStages.includes('retrying') ? 'partial' : 'complete';
  }
}

export function buildFranchise(input: FranchiseInput): FranchiseView {
  const members = input.traversal.nodes.filter(
    ({ anilistId }) => !input.removed.has(anilistId),
  );
  const seasons = members
    .filter((node) => isSeason(node, input.overrides.get(node.anilistId)))
    .toSorted(byAirDate);
  return {
    state: stateOf(input.traversal, input.missingStages),
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
 * The title with the franchise's base title removed from its start, at a word boundary, and
 * the separators after it dropped ("Gintama.: Slip Arc" after "Gintama" is "Slip Arc"); the
 * whole title when it does not start with the base title.
 */
export function afterBaseTitle(title: string, base: string): string {
  const next = title.charAt(base.length);
  const startsWithBase =
    title.slice(0, base.length).toLowerCase() === base.toLowerCase() &&
    !/[\p{L}\p{N}]/u.test(next);
  return startsWithBase
    ? title
        .slice(base.length)
        .replace(/^[\s\p{P}]+/u, '')
        .trimEnd()
    : title;
}

/** English titles when both have one and they share the base, else romaji, else the title. */
function remainderOf(node: MediaSummary, base: MediaSummary): string {
  const pairs = [
    [node.titleEnglish, base.titleEnglish],
    [node.titleRomaji, base.titleRomaji],
  ] as const;
  for (const [title, baseTitle] of pairs) {
    if (title === null || baseTitle === null) continue;
    const rest = afterBaseTitle(title, baseTitle);
    if (rest !== title) return rest;
  }
  return titleOf(node);
}

/**
 * ADR 0008 item 6 for one entry: what its title adds to the base title, unless that is
 * nothing (then "Season <position>") or only a season number ("Season 2", "2nd Season",
 * "Second Season", "2", "II": then "Season <that number>", so Gintama Season 3 stays
 * Season 3).
 */
export function labelFromRemainder(
  remainder: string,
  position: number,
): string {
  if (remainder === '') return `Season ${position}`;
  const numbered = NUMBERED_SEASON.exec(remainder);
  const digits = numbered?.slice(1).find((group) => group !== undefined);
  if (digits !== undefined) return `Season ${Number(digits)}`;
  const ordinal = ORDINAL_SEASON.exec(remainder)?.[1]?.toLowerCase();
  if (ordinal !== undefined) return `Season ${ORDINALS.indexOf(ordinal) + 1}`;
  // A Roman numeral alone is unambiguous after the base title ("Mob Psycho 100 II").
  const roman = ROMAN_SEASONS.indexOf(remainder.toUpperCase());
  return roman === -1 ? remainder : `Season ${roman + 1}`;
}

/**
 * ADR 0008 item 6. An override label wins and takes no position. Every other entry is
 * labelled from what its title adds to the base title (the first main-line entry's); see
 * labelFromRemainder. Two computed labels that clash show their titles instead, then the
 * year, then the AniList id.
 */
function labelled(
  seasons: readonly RelationNode[],
  input: FranchiseInput,
): MainLineEntry[] {
  const overrideLabel = (node: RelationNode) =>
    input.overrides.get(node.anilistId)?.label ?? null;
  // The first season without an override label: a special forced in first is no base.
  const base =
    seasons.find((node) => overrideLabel(node) === null) ?? seasons[0];
  // An override label is final and takes no position: the others are numbered around it.
  const fixed = seasons.map((node) => overrideLabel(node));
  let position = 0;
  const first = seasons.map((node, index) => {
    const fixedLabel = fixed[index];
    if (fixedLabel !== null && fixedLabel !== undefined) return fixedLabel;
    position += 1;
    return labelFromRemainder(remainderOf(node, base ?? node), position);
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
  return FRANCHISE_RELATED_GROUPS.flatMap((group) => {
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
