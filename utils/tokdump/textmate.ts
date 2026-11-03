/** TextMate layer: manifest index -> vscode-textmate registry -> per-line tokens. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vsctm from 'vscode-textmate';
import * as onig from 'vscode-oniguruma';
import type { ExtensionIndex } from './grammar-source';
import type { TmToken } from './ir';

function findUp(rel: string): string {
    for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
        const p = path.join(dir, 'node_modules', rel);
        if (fs.existsSync(p)) return p;
        if (path.dirname(dir) === dir) throw new Error(`cannot find node_modules/${rel} from ${process.cwd()}`);
    }
}

let onigReady: Promise<void> | undefined;
function ensureOnig(): Promise<void> {
    // loadWASM may only run once per process
    onigReady ??= (async () => {
        const wasm = fs.readFileSync(findUp('vscode-oniguruma/release/onig.wasm'));
        await onig.loadWASM(new Uint8Array(wasm).buffer);
    })();
    return onigReady;
}

export async function tokenizeTextMate(
    lines: string[],
    index: ExtensionIndex,
    rootScope: string
): Promise<{ tokens: TmToken[]; unresolved: string[] }> {
    await ensureOnig();
    const unresolved = new Set<string>();
    const registry = new vsctm.Registry({
        onigLib: Promise.resolve({
            createOnigScanner: (patterns: string[]) => new onig.OnigScanner(patterns),
            createOnigString: (s: string) => new onig.OnigString(s),
        }),
        loadGrammar: async (scope) => {
            const file = index.scopeToFile.get(scope);
            if (!file) {
                unresolved.add(scope);
                return null;
            }
            return vsctm.parseRawGrammar(fs.readFileSync(file, 'utf8'), file); // format chosen by file extension (.json/.plist/.yaml)
        },
        // Same prefix rule as VSCode: a grammar injected into "text.html" also applies to "text.html.markdown".
        getInjections: (scope) => {
            const parts = scope.split('.');
            const out: string[] = [];
            for (let i = 1; i <= parts.length; i++) out.push(...(index.injections.get(parts.slice(0, i).join('.')) ?? []));
            return out.length ? out : undefined;
        },
    });
    const grammar = await registry.loadGrammar(rootScope);
    if (!grammar) throw new Error(`grammar for ${rootScope} failed to load`);

    const tokens: TmToken[] = [];
    let stack = vsctm.INITIAL;
    lines.forEach((text, i) => {
        const r = grammar.tokenizeLine(text, stack);
        for (const t of r.tokens) {
            const end = Math.min(t.endIndex, text.length); // endIndex may include the implicit "\n"
            const slice = text.slice(t.startIndex, end);
            if (slice.trim()) tokens.push({ line: i + 1, col: t.startIndex + 1, end: end + 1, text: slice, scopes: t.scopes });
        }
        stack = r.ruleStack;
    });
    return { tokens, unresolved: [...unresolved].sort() };
}
