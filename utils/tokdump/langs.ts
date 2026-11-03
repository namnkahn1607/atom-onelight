/**
 * Per-language configuration. DATA ONLY: every behaviour lives elsewhere.
 * Adding a language = adding an entry here + a fixture. If an entry needs a new
 * field to work, that is a signal the generic code is missing a capability.
 */

export interface ReadyPolicy {
    /** Delay between polls of semanticTokens/full. */
    intervalMs: number;
    /** Give up (hard error, no partial output) after this long. */
    timeoutMs: number;
    /** Accept an empty token list as a stable result. Off by default: empty usually means "not ready". */
    allowEmpty: boolean;
}

export interface LspSpec {
    /** Command to spawn; stdio transport. */
    cmd: string[];
    /** Sent as initializationOptions. */
    initOptions?: unknown;
    /** Mirrors VSCode's settings tree; answers workspace/configuration requests. */
    settings?: unknown;
    /**
     * Files the server needs next to the fixture (go.mod, compile_commands.json, ...).
     * When present the fixture is copied into a throw-away workspace together with these files.
     * When absent the server runs in place, rooted at the fixture's directory.
     */
    scaffold?: (ctx: { fixtureName: string }) => Record<string, string>;
    /** Added to the token types/modifiers advertised in client capabilities (see semantic.ts). */
    extraTokenTypes?: string[];
    extraTokenModifiers?: string[];
    ready?: Partial<ReadyPolicy>;
    requestTimeoutMs?: number;
}

export interface LangSpec {
    /** VSCode language id. The root TextMate scope is derived from extension manifests. */
    languageId: string;
    /**
     * microsoft/vscode/extensions/<name> directories to download in --source=github mode
     * (ignored in local mode, which indexes every installed extension).
     */
    builtin?: string[];
    /** Override the root scope instead of deriving it from manifests. */
    scope?: string;
    lsp?: LspSpec;
}

export const LANGS: Record<string, LangSpec> = {
    cpp: {
        languageId: 'cpp',
        builtin: ['cpp'],
        lsp: {
            cmd: ['clangd', '--log=error', '--background-index=false', '--pch-storage=memory'],
            initOptions: { fallbackFlags: ['-std=c++20', '-xc++', '-Wall'] },
        },
    },
    go: {
        languageId: 'go',
        builtin: ['go'],
        lsp: {
            cmd: ['gopls', 'serve'],
            // UNVERIFIED: key name differs between gopls versions ("semanticTokens" before ~0.17).
            initOptions: { 'ui.semanticTokens': true },
            settings: { gopls: { 'ui.semanticTokens': true } },
            scaffold: () => ({ 'go.mod': 'module fixture\n\ngo 1.22\n' }),
        },
    },

    // TextMate-only languages
    python: { languageId: 'python', builtin: ['python'] }, // no semantic layer yet (Pylance cannot be spawned standalone)
    shell: { languageId: 'shellscript', builtin: ['shellscript'] },
    make: { languageId: 'makefile', builtin: ['make'] },
    json: { languageId: 'json', builtin: ['json'] },
    yaml: { languageId: 'yaml', builtin: ['yaml'] },
    // Fenced-code injections need the fenced languages' grammars too; add their extensions here for github mode.
    markdown: { languageId: 'markdown', builtin: ['markdown-basics', 'markdown-math'] },
    // Third-party grammars: local source only (extension must be installed).
    cmake: { languageId: 'cmake' },
    toml: { languageId: 'toml' },
};