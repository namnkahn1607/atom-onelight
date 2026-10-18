// Dump TextMate scopes for a C++ fixture using the cpp grammars of a PINNED VSCode commit,
// optionally joined with a semantic-token table by (line:col), 1-based.
//
// Usage: npx tsx utils/cpp-textmate.ts --commit="$(code --version | sed -n 2p)" \
//            fixtures/.cpp <tokens-output.md> > <cpp-tokens-joined.md>
//
// Options:
//   --commit=<40-hex>      grammar source: microsoft/vscode@<commit>/extensions/cpp/syntaxes (env: VSCODE_COMMIT)
//   --grammar-dir=<path>   use a local directory of *.tmLanguage.json instead (offline / debugging)
//   --cache=<dir>          download cache, default .cache/vscode-grammars (keyed by commit)
//   --depth=<n>            innermost scopes kept per row, default 2
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import * as vsctm from 'vscode-textmate';
import * as onig from 'vscode-oniguruma';

type Tm = { line: number; col: number; text: string; scopes: string[] };
type Sem = { line: number; col: number; text: string; type: string; mods: string[] };

const GRAMMARS = ['cpp', 'cpp.embedded.macro', 'c', 'platform'] as const; // 'cpp' is required

async function grammarDirFor(commit: string, cache: string): Promise<string> {
    if (!/^[0-9a-f]{40}$/.test(commit)) {
        throw new Error(
            `--commit must be a full 40-hex SHA (got "${commit}"). Try: code --version | sed -n 2p`
        );
    }
    const dir = path.resolve(cache, commit);
    fs.mkdirSync(dir, { recursive: true });
    for (const name of GRAMMARS) {
        const file = path.join(dir, `${name}.tmLanguage.json`);
        if (fs.existsSync(file)) continue; // cache hit: a commit's content is immutable
        const url = `https://raw.githubusercontent.com/microsoft/vscode/${commit}/extensions/cpp/syntaxes/${name}.tmLanguage.json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (res.status === 404) {
            if (name === 'cpp') {
                throw new Error(
                    `404 for ${url}\n(commit not in microsoft/vscode, or no extensions/cpp at that commit)`
                );
            }
            console.error(`warn: ${name}.tmLanguage.json not present at ${commit.slice(0, 8)}`);
            continue;
        }
        if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);

        const body = await res.text();
        JSON.parse(body); // never cache garbage
        fs.writeFileSync(file + '.tmp', body);
        fs.renameSync(file + '.tmp', file);
        console.error(`fetched ${name} @ ${commit.slice(0, 8)} (${body.length} bytes)`);
    }
    return dir;
}

async function tokenizeTM(lines: string[], dir: string): Promise<{ tokens: Tm[]; unresolved: string[] }> {
    const byScope = new Map<string, string>();
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.tmLanguage.json'))) {
        const p = path.join(dir, f);
        byScope.set(JSON.parse(fs.readFileSync(p, 'utf8')).scopeName, p);
    }
    const wasm = fs.readFileSync(path.resolve('node_modules/vscode-oniguruma/release/onig.wasm'));
    await onig.loadWASM(new Uint8Array(wasm).buffer);
    const unresolved = new Set<string>();
    const registry = new vsctm.Registry({
        onigLib: Promise.resolve({
            createOnigScanner: (p: string[]) => new onig.OnigScanner(p),
            createOnigString: (s: string) => new onig.OnigString(s),
        }),
        loadGrammar: async (scope) => {
            const p = byScope.get(scope);
            if (!p) {
                unresolved.add(scope);
                return null;
            }
            return vsctm.parseRawGrammar(fs.readFileSync(p, 'utf8'), p);
        },
    });
    const grammar = await registry.loadGrammar('source.cpp');
    if (!grammar) throw new Error('source.cpp grammar not found');

    const tokens: Tm[] = [];
    let stack = vsctm.INITIAL;
    lines.forEach((l, i) => {
        const r = grammar.tokenizeLine(l, stack);
        for (const t of r.tokens) {
            const text = l.slice(t.startIndex, Math.min(t.endIndex, l.length));
            if (text.trim()) tokens.push({ line: i + 1, col: t.startIndex + 1, text, scopes: t.scopes });
        }
        stack = r.ruleStack;
    });
    return { tokens, unresolved: [...unresolved] };
}

// Accepts semantic.json or a markdown table: | L:C | `text` | `type` | `[mods]` |
function loadSemantic(p: string): Sem[] {
    const raw = fs.readFileSync(p, 'utf8');
    if (!p.endsWith('.md')) return JSON.parse(raw);
    const out: Sem[] = [];
    for (const l of raw.split(/\r?\n/)) {
        const m = l.match(/^\|\s*(\d+):(\d+)\s*\|\s*`(.+?)`\s*\|\s*`(.+?)`\s*\|\s*`\[(.*?)\]`\s*\|/);
        if (m) {
            out.push({
                line: +m[1],
                col: +m[2],
                text: m[3],
                type: m[4],
                mods: m[5].split(',').map((x) => x.trim()).filter(Boolean)
            });
        }
    }
    return out;
}

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            commit: { type: 'string' },
            'grammar-dir': { type: 'string' },
            cache: { type: 'string', default: '.cache/vscode-grammars' },
            depth: { type: 'string', default: '2' },
        },
    });
    if (!positionals[0]) {
        throw new Error('usage: dump-tm.ts --commit=<sha> <fixture.cpp> [semantic.md|json]');
    }
    const commit = values.commit ?? process.env.VSCODE_COMMIT;
    let dir: string, provenance: string;
    if (values['grammar-dir']) {
        dir = path.resolve(values['grammar-dir']); provenance = `grammar-dir: ${dir}`;
    } else if (commit) {
        dir = await grammarDirFor(commit, values.cache!); provenance = `microsoft/vscode@${commit}`;
    } else {
        throw new Error('need --commit=<sha> (or VSCODE_COMMIT) or --grammar-dir=<path>');
    }

    const depth = Number(values.depth);
    const lines = fs.readFileSync(path.resolve(positionals[0]), 'utf8').split(/\r?\n/);
    const { tokens: tm, unresolved } = await tokenizeTM(lines, dir);
    const sem: Sem[] = positionals[1] ? loadSemantic(positionals[1]) : [];
    const semAt = new Map(sem.map((s) => [`${s.line}:${s.col}`, s]));

    const rows = new Map<string, { sem: string; scopes: string; n: number; ex: string[] }>();
    for (const t of tm) {
        const s = semAt.get(`${t.line}:${t.col}`);
        const semLabel = s ? [s.type, ...s.mods.filter((m) => !/Scope$|^(declaration|definition)$/.test(m))].join('.') : '-';
        const scopes = t.scopes.slice(1).reverse().slice(0, depth).join(' < ');
        const key = `${semLabel}\u0000${scopes}`;
        const r = rows.get(key) ?? { sem: semLabel, scopes, n: 0, ex: [] };
        r.n++;
        if (r.ex.length < 4 && !r.ex.includes(t.text)) r.ex.push(t.text);
        rows.set(key, r);
    }
    console.log(`<!-- grammar: ${provenance} -->`);
    console.log('| semantic | textmate scopes (innermost first) | n | examples |\n|---|---|---|---|');
    for (const r of rows.values()) {
        console.log(`| ${r.sem} | ${r.scopes} | ${r.n} | ${r.ex.map((e) => '`' + e.replace(/\|/g, '\\|') + '`').join(' ')} |`);
    }

    const joined = tm.filter((t) => semAt.has(`${t.line}:${t.col}`)).length;
    console.error(`grammar: ${provenance}`);
    console.error(`TM tokens: ${tm.length}, joined with semantic: ${joined}, semantic rows: ${sem.length}`);
    const tmAt = new Set(tm.map((t) => `${t.line}:${t.col}`));
    const orphan = sem.filter((s) => !tmAt.has(`${s.line}:${s.col}`));
    if (orphan.length) {
        console.error('ORPHAN semantic tokens (no TM token starts there):', orphan.map((o) => `${o.line}:${o.col} ${o.text}`).join(', '));
    }
    if (unresolved.length) {
        console.error('grammar includes not available (ignored by vscode-textmate):', unresolved.join(', '));
    }
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
