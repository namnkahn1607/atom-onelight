/**
 * Where TextMate grammars come from, resolved through extension MANIFESTS rather than
 * hardcoded file names: every VSCode extension declares its grammars in
 * package.json -> contributes.grammars, so one index serves every language,
 * built-in or third-party (cmake, toml, ...).
 *
 * Two sources feed the same indexer:
 *   local   installed extension directories (ground truth: what your VSCode actually loads)
 *   github  microsoft/vscode@<commit>/extensions/<name> materialised into a cache dir that
 *           mimics the installed layout (reproducible, needs network, built-ins only)
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { LangSpec } from './langs';

interface GrammarContribution {
    language?: string;
    scopeName: string;
    path: string;
    injectTo?: string[];
}
interface Manifest {
    contributes?: {
        grammars?: GrammarContribution[];
        semanticTokenTypes?: { id: string }[];
        semanticTokenModifiers?: { id: string }[];
    };
}

export interface ExtensionIndex {
    scopeToFile: Map<string, string>;
    langToScope: Map<string, string>;
    /** target scope -> scopes of grammars injected into it (from `injectTo`). */
    injections: Map<string, string[]>;
    /** Token types/modifiers contributed by extensions: VSCode advertises these to servers too. */
    semanticTypes: string[];
    semanticModifiers: string[];
    extensionCount: number;
    warnings: string[];
}

const numericSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

function extensionDirs(root: string): string[] {
    if (fs.existsSync(path.join(root, 'package.json'))) return [root];
    return fs
        .readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory() || d.isSymbolicLink())
        .map((d) => path.join(root, d.name))
        .sort(numericSort); // ascending versions: a later duplicate overrides an earlier one
}

export function buildIndex(roots: string[]): ExtensionIndex {
    const idx: ExtensionIndex = {
        scopeToFile: new Map(),
        langToScope: new Map(),
        injections: new Map(),
        semanticTypes: [],
        semanticModifiers: [],
        extensionCount: 0,
        warnings: [],
    };
    const types = new Set<string>();
    const mods = new Set<string>();
    for (const root of roots) {
        for (const dir of extensionDirs(root)) {
            let manifest: Manifest;
            try {
                manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
            } catch {
                continue; // not an extension directory
            }
            idx.extensionCount++;
            for (const t of manifest.contributes?.semanticTokenTypes ?? []) types.add(t.id);
            for (const m of manifest.contributes?.semanticTokenModifiers ?? []) mods.add(m.id);
            for (const g of manifest.contributes?.grammars ?? []) {
                const file = path.resolve(dir, g.path);
                if (!fs.existsSync(file)) {
                    idx.warnings.push(`${path.basename(dir)}: grammar file missing: ${g.path}`);
                    continue;
                }
                const prev = idx.scopeToFile.get(g.scopeName);
                if (prev && prev !== file) idx.warnings.push(`scope ${g.scopeName}: ${prev} overridden by ${file}`);
                idx.scopeToFile.set(g.scopeName, file);
                if (g.language) idx.langToScope.set(g.language, g.scopeName);
                for (const target of g.injectTo ?? []) {
                    const list = idx.injections.get(target) ?? [];
                    if (!list.includes(g.scopeName)) list.push(g.scopeName);
                    idx.injections.set(target, list);
                }
            }
        }
    }
    idx.semanticTypes = [...types];
    idx.semanticModifiers = [...mods];
    return idx;
}

export function resolveRootScope(idx: ExtensionIndex, spec: LangSpec): string {
    const scope = spec.scope ?? idx.langToScope.get(spec.languageId);
    if (!scope) {
        const known = [...idx.langToScope.keys()].sort().join(', ');
        const hint = spec.builtin?.length
            ? `"${spec.languageId}" is a built-in language: pass --commit=<sha> (or VSCODE_COMMIT) so its grammar is fetched from microsoft/vscode`
            : `"${spec.languageId}" is third-party: install its extension and point --ext-dir at the extensions directory`;
        throw new Error(`no grammar contributes language "${spec.languageId}" in the indexed extensions.\nknown language ids: ${known}\nhint: ${hint}`);
    }
    if (!idx.scopeToFile.has(scope)) throw new Error(`root scope ${scope} has no grammar file`);
    return scope;
}

// ---------------------------------------------------------------------------------------

export interface SourceOptions {
    mode: 'auto' | 'local' | 'github';
    extDirs: string[];
    commit?: string;
    cacheDir: string;
}

export interface ResolvedSource {
    /** mixed = GitHub built-ins layered under local extension directories. */
    mode: 'local' | 'github' | 'mixed';
    /** Index order = override order: later roots win on a duplicate scope. */
    roots: string[];
    commit: string | null;
}

function isDir(p: string): boolean {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

/** `code --version` prints version, commit, arch on separate lines. Slow under WSL: only used when needed. */
function commitFromCodeCli(): string | undefined {
    try {
        const out = execFileSync('code', ['--version'], { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'ignore'] });
        const sha = out.split(/\r?\n/)[1]?.trim();
        return sha && /^[0-9a-f]{40}$/.test(sha) ? sha : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Installed extension directories. Third-party extensions (cmake, toml, ...) live here.
 * The server's built-in extensions dir is included only if it happens to exist; nothing relies on it.
 */
function defaultLocalRoots(commit: string | undefined): string[] {
    const home = os.homedir();
    const cands = [
        commit ? path.join(home, '.vscode-server', 'bin', commit, 'extensions') : '',
        path.join(home, '.vscode-server', 'extensions'),
        path.join(home, '.vscode', 'extensions'),
    ];
    return cands.filter((p) => p && isDir(p));
}

/**
 * Sources are LAYERS of one index, not alternatives (the earlier either/or design silently
 * dropped built-ins whenever any local directory existed):
 *   1. github layer: built-in extensions named by spec.builtin, pinned to a commit   (auto, github)
 *   2. local layer: installed extension dirs, overriding the layer below on conflicts (auto, local)
 */
export async function resolveSource(opts: SourceOptions, spec: LangSpec): Promise<ResolvedSource> {
    const wantGithub = opts.mode !== 'local';
    const wantLocal = opts.mode !== 'github';

    let commit = opts.commit ?? process.env.VSCODE_COMMIT;
    if (commit === undefined && wantGithub && spec.builtin?.length) commit = commitFromCodeCli();
    if (commit !== undefined && !/^[0-9a-f]{40}$/.test(commit)) {
        throw new Error(`--commit must be a full 40-hex SHA (got "${commit}"). Try: code --version | sed -n 2p`);
    }

    const roots: string[] = [];
    let usedGithub = false;
    let usedLocal = false;

    if (wantGithub && spec.builtin?.length) {
        if (commit) {
            roots.push(await materializeFromGithub(commit, spec.builtin, path.resolve(opts.cacheDir)));
            usedGithub = true;
        } else if (opts.mode === 'github') {
            throw new Error('--source=github needs --commit=<sha> (or VSCODE_COMMIT)');
        } else {
            console.error(
                `warn: no VSCode commit known (pass --commit=<sha> or set VSCODE_COMMIT; \`code --version\` failed), ` +
                `so built-in grammars (${spec.builtin.join(', ')}) are NOT fetched`
            );
        }
    }

    if (wantLocal) {
        const local = opts.extDirs.length ? opts.extDirs.map((d) => path.resolve(d)) : defaultLocalRoots(commit);
        for (const r of local) if (!isDir(r)) throw new Error(`--ext-dir is not a directory: ${r}`);
        if (local.length) {
            roots.push(...local);
            usedLocal = true;
        }
    }

    if (!roots.length) {
        throw new Error(
            'no grammar source: no local extension directory found and no GitHub layer possible.\n' +
            'pass --commit=<sha> for built-in languages and/or --ext-dir=<dir> for installed extensions'
        );
    }
    return { mode: usedGithub && usedLocal ? 'mixed' : usedGithub ? 'github' : 'local', roots, commit: commit ?? null };
}

async function fetchText(url: string): Promise<string | null> {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    return res.text();
}

function writeAtomic(file: string, body: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', body);
    fs.renameSync(file + '.tmp', file);
}

/** A commit's content is immutable, so any file already in the cache is valid forever. */
async function materializeFromGithub(commit: string, exts: string[], cacheDir: string): Promise<string> {
    const root = path.join(cacheDir, commit);
    for (const ext of exts) {
        const base = `https://raw.githubusercontent.com/microsoft/vscode/${commit}/extensions/${ext}`;
        const manifestFile = path.join(root, ext, 'package.json');
        if (!fs.existsSync(manifestFile)) {
            const body = await fetchText(`${base}/package.json`);
            if (body === null) throw new Error(`extensions/${ext} does not exist at ${commit.slice(0, 8)}`);
            JSON.parse(body);
            writeAtomic(manifestFile, body);
            console.error(`fetched ${ext}/package.json @ ${commit.slice(0, 8)}`);
        }
        const manifest: Manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        for (const g of manifest.contributes?.grammars ?? []) {
            const rel = path.posix.normalize(g.path.replace(/\\/g, '/'));
            const file = path.join(root, ext, rel);
            if (fs.existsSync(file)) continue;
            const body = await fetchText(`${base}/${rel}`);
            if (body === null) {
                console.error(`warn: ${ext}/${rel} not present at ${commit.slice(0, 8)}`);
                continue;
            }
            if (rel.endsWith('.json')) JSON.parse(body); // never cache garbage
            writeAtomic(file, body);
            console.error(`fetched ${ext}/${rel} (${body.length} bytes)`);
        }
    }
    return root;
}
