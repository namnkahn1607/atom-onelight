/**
 * Views over a Dump. Two renderers, one data model:
 *   markdown  for reading (the table you paste into a conversation / review in an editor)
 *   json      for machines (snapshots, verify scripts); one token per line so it diffs and greps well
 */
import type { Dump, JoinedToken, Relation } from './ir';

export type View = 'summary' | 'tokens';

export interface RenderOptions {
    /** Innermost scopes kept per row; 0 = all. The root scope is always omitted from rows. */
    depth: number;
    views: View[];
    /** Semantic modifiers matching this are dropped from LABELS only (raw data keeps them). */
    hideMods: RegExp;
}

export const DEFAULT_HIDE_MODS = /Scope$|^(declaration|definition)$/;

// ---------------------------------------------------------------------------------------
// shared derivations

export function scopesLabel(scopes: string[], depth: number): string {
    const inner = scopes.slice(1).reverse();
    const kept = depth > 0 ? inner.slice(0, depth) : inner;
    return kept.length ? kept.join(' < ') : '-';
}

export function semLabel(t: JoinedToken, hide: RegExp): string {
    if (!t.sem.length) return '-';
    return t.sem.map((s) => [s.type, ...s.mods.filter((m) => !hide.test(m))].join('.')).join(' + ');
}

export interface SummaryRow {
    sem: string;
    scopes: string;
    n: number;
    rels: Relation[];
    first: string;
    examples: string[];
}

export function buildSummary(tokens: JoinedToken[], depth: number, hide: RegExp): SummaryRow[] {
    const rows = new Map<string, SummaryRow & { relSet: Set<Relation> }>();
    for (const t of tokens) {
        const sem = semLabel(t, hide);
        const scopes = scopesLabel(t.scopes, depth);
        const key = `${sem}\u0000${scopes}`;
        let r = rows.get(key);
        if (!r) {
            r = { sem, scopes, n: 0, rels: [], relSet: new Set(), first: `${t.line}:${t.col}`, examples: [] };
            rows.set(key, r);
        }
        r.n++;
        r.relSet.add(t.rel);
        if (r.examples.length < 4 && !r.examples.includes(t.text)) r.examples.push(t.text);
    }
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    return [...rows.values()]
        .map(({ relSet, ...r }) => ({ ...r, rels: [...relSet].sort() }))
        .sort((a, b) => Number(a.sem === '-') - Number(b.sem === '-') || cmp(a.sem, b.sem) || cmp(a.scopes, b.scopes));
}

// ---------------------------------------------------------------------------------------
// markdown

/**
 * Inline code span that survives backticks, pipes and edge whitespace inside a table cell.
 * Leading/trailing spaces are shown as "·" because TM tokens can carry them and markdown
 * would otherwise hide or ambiguously pad them; tabs are shown as \\t.
 */
export function code(s: string): string {
    const shown = s
        .replace(/\t/g, '\\t')
        .replace(/^ +| +$/g, (m) => '·'.repeat(m.length));
    const longest = Math.max(0, ...(shown.match(/`+/g) ?? []).map((r) => r.length));
    const fence = '`'.repeat(longest + 1);
    const pad = /^`|`$/.test(shown) ? ' ' : '';
    return `${fence}${pad}${shown.replace(/\|/g, '\\|')}${pad}${fence}`;
}

function table(header: string[], rows: string[][]): string {
    const align = header.map(() => '---');
    return [header, align, ...rows].map((r) => `| ${r.join(' | ')} |`).join('\n');
}

export function renderMarkdown(d: Dump, o: RenderOptions): string {
    const m = d.meta;
    const hasSem = m.semantic !== false;
    const out: string[] = [];

    out.push(`# tokdump: ${m.lang} (${m.fixture})`, '');
    out.push(`- schema: ${d.schema}`);
    out.push(`- fixture: ${m.fixtureLines} lines, sha256 ${m.fixtureSha256.slice(0, 16)}`);
    out.push(
        `- grammar: ${m.grammar.source}, root scope ${m.grammar.rootScope}, ` +
        `vscode commit ${m.grammar.vscodeCommit ?? 'unknown'}, ${m.grammar.extensionsIndexed} extensions indexed`
    );
    for (const r of m.grammar.roots) out.push(`  - root: ${r}`);
    if (m.semantic) {
        out.push(`- semantic: ${m.semantic.server.name ?? '?'} ${m.semantic.server.version ?? ''} via \`${m.semantic.cmd.join(' ')}\``.trimEnd());
    } else {
        out.push('- semantic: none (TextMate only)');
    }
    out.push(`- scope depth: ${o.depth === 0 ? 'all' : o.depth} innermost first, root scope omitted`);
    if (hasSem) out.push(`- modifiers hidden from labels: ${o.hideMods}`);
    out.push('- text cells: leading/trailing spaces shown as "·"');
    out.push('');

    const c = d.coverage;
    out.push('## Coverage', '');
    const cov: string[][] = [['TextMate tokens', String(c.tmTokens)]];
    if (hasSem) {
        cov.push(['semantic tokens', String(c.semTokens)]);
        for (const [rel, n] of Object.entries(c.relations)) cov.push([`TM tokens with rel=${rel}`, String(n)]);
        cov.push(['orphan semantic tokens (must be 0)', String(c.orphanSemTokens)]);
    }
    out.push(table(['metric', 'n'], cov), '');
    if (hasSem) {
        out.push(
            'rel: exact = same range; sem-wider = semantic token strictly contains the TM token; ' +
            'tm-wider = semantic token strictly inside the TM token; partial = straddles a TM boundary; ' +
            'multi = several semantic tokens overlap; none = TM style only.',
            ''
        );
    }
    if (d.unresolvedScopes.length) {
        out.push('## Unresolved grammar includes', '', 'Not found in the indexed extensions (vscode-textmate ignores them silently):', '');
        for (const s of d.unresolvedScopes) out.push(`- ${s}`);
        out.push('');
    }
    if (d.orphans.length) {
        out.push('## Orphan semantic tokens', '');
        out.push(
            table(
                ['L:C', 'text', 'semantic'],
                d.orphans.map((s) => [`${s.line}:${s.col}`, code(s.text), code([s.type, ...s.mods].join('.'))])
            ),
            ''
        );
    }

    if (o.views.includes('summary')) {
        const rows = buildSummary(d.tokens, o.depth, o.hideMods);
        out.push('## Summary', '', 'One row per distinct (semantic label, scope stack). `first` is the first L:C of the row.', '');
        const header = hasSem
            ? ['semantic', 'textmate scopes (innermost first)', 'n', 'rel', 'first', 'examples']
            : ['textmate scopes (innermost first)', 'n', 'first', 'examples'];
        out.push(
            table(
                header,
                rows.map((r) => {
                    const ex = r.examples.map(code).join(' ');
                    return hasSem
                        ? [r.sem === '-' ? '-' : code(r.sem), r.scopes, String(r.n), r.rels.join(','), r.first, ex]
                        : [r.scopes, String(r.n), r.first, ex];
                })
            ),
            ''
        );
    }

    if (o.views.includes('tokens')) {
        out.push('## Tokens', '', 'One row per TextMate token, in document order.', '');
        const header = hasSem ? ['L:C', 'text', 'semantic', 'rel', 'scopes'] : ['L:C', 'text', 'scopes'];
        out.push(
            table(
                header,
                d.tokens.map((t) => {
                    const base = [`${t.line}:${t.col}`, code(t.text)];
                    const sc = scopesLabel(t.scopes, o.depth);
                    return hasSem
                        ? [...base, t.sem.length ? code(semLabel(t, o.hideMods)) : '-', t.rel, sc]
                        : [...base, sc];
                })
            ),
            ''
        );
    }
    return out.join('\n');
}

// ---------------------------------------------------------------------------------------
// json

export function renderJson(d: Dump, o: RenderOptions): string {
    const indent = (s: string, by: string) => s.replace(/\n/g, `\n${by}`);
    const lines = (items: unknown[]) =>
        items.length ? `[\n${items.map((i) => '    ' + JSON.stringify(i)).join(',\n')}\n  ]` : '[]';
    return [
        '{',
        `  "schema": ${JSON.stringify(d.schema)},`,
        `  "meta": ${indent(JSON.stringify(d.meta, null, 2), '  ')},`,
        `  "coverage": ${indent(JSON.stringify(d.coverage, null, 2), '  ')},`,
        `  "unresolvedScopes": ${JSON.stringify(d.unresolvedScopes)},`,
        `  "summary": ${lines(buildSummary(d.tokens, o.depth, o.hideMods))},`,
        `  "orphans": ${lines(d.orphans)},`,
        `  "tokens": ${lines(d.tokens)}`,
        '}',
        '',
    ].join('\n');
}
