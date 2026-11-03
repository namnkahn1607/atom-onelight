/**
 * Join the two layers by CHARACTER RANGE overlap, not by identical start column.
 * This mirrors what VSCode does: a semantic token paints a range of characters on top of
 * whatever TextMate produced there; the two layers have no reason to share boundaries.
 *
 * Complexity: bucketed per line; a line holds few semantic tokens, so it is effectively O(n).
 */
import {
    RELATIONS,
    type Coverage,
    type JoinedToken,
    type Relation,
    type SemRef,
    type SemToken,
    type TmToken,
} from './ir';

function relate(t: TmToken, o: SemToken[]): Relation {
    if (o.length === 0) return 'none';
    if (o.length > 1) return 'multi';
    const m = o[0];
    if (m.col === t.col && m.end === t.end) return 'exact';
    if (m.col <= t.col && m.end >= t.end) return 'sem-wider';
    if (t.col <= m.col && t.end >= m.end) return 'tm-wider';
    return 'partial';
}

export function joinTokens(
    tm: TmToken[],
    sem: SemToken[]
): { tokens: JoinedToken[]; orphans: SemToken[]; coverage: Coverage } {
    const byLine = new Map<number, SemToken[]>();
    for (const s of sem) {
        const bucket = byLine.get(s.line) ?? [];
        bucket.push(s);
        byLine.set(s.line, bucket);
    }
    for (const b of byLine.values()) b.sort((a, c) => a.col - c.col);

    const hit = new Set<SemToken>();
    const relations = Object.fromEntries(RELATIONS.map((r) => [r, 0])) as Record<Relation, number>;
    const tokens: JoinedToken[] = tm.map((t) => {
        const overlapping = (byLine.get(t.line) ?? []).filter((m) => m.col < t.end && m.end > t.col);
        overlapping.forEach((m) => hit.add(m));
        const rel = relate(t, overlapping);
        relations[rel]++;
        const refs: SemRef[] = overlapping.map((m) => ({ type: m.type, mods: m.mods, col: m.col, end: m.end }));
        return { ...t, rel, sem: refs };
    });

    const orphans = sem.filter((s) => !hit.has(s));
    return {
        tokens,
        orphans,
        coverage: { tmTokens: tm.length, semTokens: sem.length, relations, orphanSemTokens: orphans.length },
    };
}
