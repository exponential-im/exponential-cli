import { describe, it, expect } from 'vitest';
import { computeTagIds, matchTag, resolveTagRefs, splitTags, type TagLike } from './decisionTags.js';

const tag = (id: string, name: string, category: string | null, extra: Partial<TagLike> = {}): TagLike => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  category,
  archivedAt: null,
  ...extra,
});

const DQ = tag('p1', 'Data Quality', 'pillar');
const PLAT = tag('p2', 'Platform', 'pillar');
const INFRA = tag('l1', 'infra', null);
const TRIAGE = tag('l2', 'needs-triage', 'triage');
const ALL = [DQ, PLAT, INFRA, TRIAGE];

describe('matchTag', () => {
  it('matches by id, slug and case-insensitive name', () => {
    expect(matchTag(ALL, 'p1', 'pillar')).toBe(DQ);
    expect(matchTag(ALL, 'data-quality', 'pillar')).toBe(DQ);
    expect(matchTag(ALL, '  data QUALITY ', 'pillar')).toBe(DQ);
  });

  it('treats any non-pillar category as a label', () => {
    expect(matchTag(ALL, 'needs-triage', 'label')).toBe(TRIAGE);
  });

  it('says when the ref names the other kind', () => {
    expect(() => matchTag(ALL, 'infra', 'pillar')).toThrow('is a label, not a Pillar. Use --label');
    expect(() => matchTag(ALL, 'Platform', 'label')).toThrow('is a Pillar, not a label. Use --pillar');
  });

  it('fails on no match and on more than one', () => {
    expect(() => matchTag(ALL, 'Nope', 'pillar')).toThrow('No Pillar named "Nope"');
    const twin = tag('p3', 'Data Quality', 'pillar', { slug: 'dq-2' });
    expect(() => matchTag([...ALL, twin], 'Data Quality', 'pillar')).toThrow('matches 2 Pillars');
  });

  it('prefers a slug match over a different tag with that name', () => {
    const odd = tag('p4', 'data-quality', 'pillar', { slug: 'something-else' });
    expect(matchTag([DQ, odd], 'data-quality', 'pillar')).toBe(DQ);
  });
});

describe('resolveTagRefs', () => {
  it('prefers a live tag over an archived one with the same name', () => {
    const old = tag('p9', 'Data Quality', 'pillar', { slug: 'data-quality-old', archivedAt: new Date() });
    expect(resolveTagRefs([old, DQ], ['Data Quality'], 'pillar')).toEqual([DQ]);
  });

  it('falls back to an archived tag when it is the only match', () => {
    const old = tag('p9', 'Legacy', 'pillar', { archivedAt: new Date() });
    expect(resolveTagRefs([old, DQ], ['Legacy'], 'pillar')).toEqual([old]);
  });
});

describe('computeTagIds', () => {
  it('keeps order, appends adds, and ignores duplicates', () => {
    expect(computeTagIds([INFRA], ALL, { addPillar: ['Data Quality', 'p1'] })).toEqual(['l1', 'p1']);
  });

  it('removes by name from the current set', () => {
    expect(computeTagIds([DQ, INFRA], ALL, { removePillar: ['data quality'] })).toEqual(['l1']);
  });

  it('can remove an archived tag that is still on the decision', () => {
    const old = tag('p9', 'Legacy', 'pillar', { archivedAt: new Date() });
    expect(computeTagIds([old, INFRA], ALL, { removePillar: ['Legacy'] })).toEqual(['l1']);
  });

  it('clears one kind and leaves the other', () => {
    expect(computeTagIds([DQ, INFRA], ALL, { clearPillars: true, addPillar: ['Platform'] })).toEqual([
      'l1',
      'p2',
    ]);
    expect(computeTagIds([DQ, INFRA, TRIAGE], ALL, { clearLabels: true })).toEqual(['p1']);
  });
});

describe('splitTags', () => {
  it('splits Pillars from labels', () => {
    expect(splitTags(ALL)).toEqual({ pillars: [DQ, PLAT], labels: [INFRA, TRIAGE] });
  });
});
