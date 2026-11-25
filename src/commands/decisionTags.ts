import type { Tag } from 'exponential-sdk';
import type { getClient } from '../client/index.js';

/**
 * Pillars and labels on decisions (exponential-app ADR-0086).
 *
 * A decision carries one tag set holding both kinds: a tag whose `category`
 * is `"pillar"` is a Pillar, any other tag is a label. The server only offers
 * `tag.setEntityTags`, which REPLACES the whole set, so every add or remove
 * here reads the current set first and writes the full result back.
 */

export const PILLAR_CATEGORY = 'pillar';

export type TagKind = 'pillar' | 'label';

/** The fields this module reads; both `Tag` and a list row's `TagRef` have them. */
export interface TagLike {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  archivedAt?: Date | string | null;
}

export function isPillar(tag: Pick<TagLike, 'category'>): boolean {
  return tag.category === PILLAR_CATEGORY;
}

export function tagKind(tag: Pick<TagLike, 'category'>): TagKind {
  return isPillar(tag) ? 'pillar' : 'label';
}

export function splitTags<T extends TagLike>(tags: readonly T[]): { pillars: T[]; labels: T[] } {
  return {
    pillars: tags.filter((t) => isPillar(t)),
    labels: tags.filter((t) => !isPillar(t)),
  };
}

function kindNoun(kind: TagKind): string {
  return kind === 'pillar' ? 'Pillar' : 'label';
}

/**
 * Find the one tag of `kind` that `ref` names: an exact id, then a slug, then
 * a name (case-insensitive). Throws when nothing matches, when the ref names
 * a tag of the other kind, and when a name matches more than one tag.
 */
export function matchTag<T extends TagLike>(
  candidates: readonly T[],
  ref: string,
  kind: TagKind,
): T {
  const value = ref.trim();
  if (value === '') throw new Error(`Empty ${kindNoun(kind)} name.`);
  const lower = value.toLowerCase();

  const byId = candidates.filter((t) => t.id === value);
  const bySlug = byId.length > 0 ? [] : candidates.filter((t) => t.slug.toLowerCase() === lower);
  const byName =
    byId.length > 0 || bySlug.length > 0
      ? []
      : candidates.filter((t) => t.name.trim().toLowerCase() === lower);
  const found = byId.length > 0 ? byId : bySlug.length > 0 ? bySlug : byName;

  const ofKind = found.filter((t) => tagKind(t) === kind);
  if (ofKind.length === 1) return ofKind[0]!;
  if (ofKind.length > 1) {
    const list = ofKind.map((t) => `${t.name} (slug ${t.slug}, id ${t.id})`).join('; ');
    throw new Error(
      `"${ref}" matches ${ofKind.length} ${kindNoun(kind)}s: ${list}. Pass the slug or id instead.`,
    );
  }
  if (found.length > 0) {
    const other = kind === 'pillar' ? 'label' : 'Pillar';
    const flag = kind === 'pillar' ? '--label' : '--pillar';
    throw new Error(`"${ref}" is a ${other}, not a ${kindNoun(kind)}. Use ${flag} for it.`);
  }
  const listCmd =
    kind === 'pillar'
      ? 'exponential labels list --category pillar --workspace <slug>'
      : 'exponential labels list --workspace <slug>';
  throw new Error(
    `No ${kindNoun(kind)} named "${ref}" in this workspace (matched by name, slug or id). Run \`${listCmd}\` to see them.`,
  );
}

/** Tags a ref may name: the workspace's own and global tags, archived ones last. */
export async function loadWorkspaceTags(
  client: ReturnType<typeof getClient>,
  workspaceId: string,
): Promise<Tag[]> {
  const list = await client.labels.list({ workspaceId });
  return list.allTags.filter((t) => t.workspaceId === null || t.workspaceId === workspaceId);
}

function isArchived(tag: TagLike): boolean {
  return tag.archivedAt !== undefined && tag.archivedAt !== null;
}

/**
 * Resolve refs to ids. Archived tags are skipped unless nothing live matches,
 * so a live Pillar wins over an archived one with the same name.
 */
export function resolveTagRefs<T extends TagLike>(
  candidates: readonly T[],
  refs: readonly string[],
  kind: TagKind,
): T[] {
  const live = candidates.filter((t) => !isArchived(t));
  return refs.map((ref) => {
    try {
      return matchTag(live, ref, kind);
    } catch (liveError) {
      try {
        return matchTag(candidates, ref, kind);
      } catch {
        throw liveError;
      }
    }
  });
}

/**
 * Removals match the decision's attached tags first, archived ones included,
 * so `--remove-pillar Legacy` takes off the archived "Legacy" it carries even
 * when the workspace has a live tag of the same name. Only a ref that matches
 * nothing attached falls back to the workspace's tags (a no-op remove, but a
 * typo still fails loudly).
 */
function resolveRemovals<T extends TagLike>(
  current: readonly T[],
  workspaceTags: readonly T[],
  refs: readonly string[],
  kind: TagKind,
): T[] {
  return refs.map((ref) => {
    try {
      return resolveTagRefs(current, [ref], kind)[0]!;
    } catch {
      return resolveTagRefs(workspaceTags, [ref], kind)[0]!;
    }
  });
}

/** What a caller asked to change. Clears run first, then removes, then adds. */
export interface DecisionTagChanges {
  addPillar?: string[];
  removePillar?: string[];
  clearPillars?: boolean;
  addLabel?: string[];
  removeLabel?: string[];
  clearLabels?: boolean;
}

export function hasTagChanges(c: DecisionTagChanges): boolean {
  return Boolean(
    c.clearPillars ||
      c.clearLabels ||
      c.addPillar?.length ||
      c.removePillar?.length ||
      c.addLabel?.length ||
      c.removeLabel?.length,
  );
}

/**
 * The new tag-id set, in a stable order: the tags that stay keep their place,
 * added ones follow. `current` is the decision's tag set; `workspaceTags` is
 * what adds resolve against. Removes resolve against `current` too, so a tag
 * that has since been archived can still come off.
 */
export function computeTagIds(
  current: readonly TagLike[],
  workspaceTags: readonly TagLike[],
  changes: DecisionTagChanges,
): string[] {
  const removeIds = new Set<string>();
  for (const t of resolveRemovals(current, workspaceTags, changes.removePillar ?? [], 'pillar')) {
    removeIds.add(t.id);
  }
  for (const t of resolveRemovals(current, workspaceTags, changes.removeLabel ?? [], 'label')) {
    removeIds.add(t.id);
  }

  const added = [
    ...resolveTagRefs(workspaceTags, changes.addPillar ?? [], 'pillar'),
    ...resolveTagRefs(workspaceTags, changes.addLabel ?? [], 'label'),
  ];

  const kept = current.filter((t) => {
    if (changes.clearPillars && isPillar(t)) return false;
    if (changes.clearLabels && !isPillar(t)) return false;
    return !removeIds.has(t.id);
  });
  const ids = kept.map((t) => t.id);
  for (const t of added) if (!ids.includes(t.id)) ids.push(t.id);
  return ids;
}

/**
 * Apply `changes` to a decision: read its tags, compute the new set, and write
 * it back with `setEntityTags`. Returns the decision's tags as the server now
 * holds them. Skips the write when the set would not change.
 */
export async function applyDecisionTagChanges(
  client: ReturnType<typeof getClient>,
  workspaceId: string,
  decisionId: string,
  changes: DecisionTagChanges,
): Promise<Tag[]> {
  const current = await client.labels.listForEntity({ entityType: 'decision', entityId: decisionId });
  const needsWorkspaceTags = Boolean(
    changes.addPillar?.length ||
      changes.addLabel?.length ||
      changes.removePillar?.length ||
      changes.removeLabel?.length,
  );
  const workspaceTags = needsWorkspaceTags ? await loadWorkspaceTags(client, workspaceId) : [];
  const tagIds = computeTagIds(current, workspaceTags, changes);
  const unchanged =
    tagIds.length === current.length && tagIds.every((id, i) => current[i]?.id === id);
  if (unchanged) return current;
  const result = await client.labels.setEntityTags({
    entityType: 'decision',
    entityId: decisionId,
    tagIds,
  });
  return result.tags;
}

/** `"Data Quality, Platform"`, or null for none. */
export function tagNames(tags: readonly Pick<TagLike, 'name'>[]): string | null {
  return tags.length > 0 ? tags.map((t) => t.name).join(', ') : null;
}
