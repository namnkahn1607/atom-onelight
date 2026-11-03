/**
 * Semantic layer: drive any stdio LSP server to obtain textDocument/semanticTokens/full.
 * Everything language-specific comes from LspSpec (data). The protocol steps are identical
 * for clangd, gopls, rust-analyzer, ...
 *
 * Interface boundary: the CLI only needs `SemanticProvider`. A different provider (e.g. one
 * that runs inside a real VSCode extension host, needed for closed servers such as Pylance)
 * can be slotted in without touching join/render.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LspConnection, LspError } from './lsp-connection';
import { splitLines, type SemToken } from './ir';
import type { LspSpec, ReadyPolicy } from './langs';

export interface SemanticRequest {
    languageId: string;
    fixturePath: string;
    text: string;
    extraTypes: string[];
    extraModifiers: string[];
}

export interface SemanticResult {
    tokens: SemToken[];
    server: { name: string | null; version: string | null };
    legend: { tokenTypes: string[]; tokenModifiers: string[] };
}

export type SemanticProvider = (req: SemanticRequest) => Promise<SemanticResult>;

// Union of what VSCode's client and the LSP spec define. Servers pick their own legend, but some
// (gopls) consult what the client advertises, so advertise generously, as VSCode does.
const BASE_TYPES = [
    'namespace', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'type', 'parameter', 'variable',
    'property', 'enumMember', 'decorator', 'event', 'function', 'method', 'macro', 'label', 'comment',
    'string', 'keyword', 'modifier', 'number', 'regexp', 'operator',
];
const BASE_MODIFIERS = [
    'declaration', 'definition', 'readonly', 'static', 'deprecated', 'abstract', 'async', 'modification',
    'documentation', 'defaultLibrary',
];

const DEFAULT_READY: ReadyPolicy = { intervalMs: 300, timeoutMs: 30_000, allowEmpty: false };
const RETRYABLE = new Set([-32800 /* RequestCancelled */, -32801 /* ContentModified */, -32802 /* ServerCancelled */]);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function decodeSemanticTokens(
    data: number[],
    legend: { tokenTypes: string[]; tokenModifiers: string[] },
    lines: string[]
): SemToken[] {
    if (data.length % 5 !== 0) throw new Error(`semantic token data length ${data.length} is not a multiple of 5`);
    const out: SemToken[] = [];
    let line = 0;
    let col = 0;
    for (let i = 0; i < data.length; i += 5) {
        const [dLine, dStart, length, typeIdx, modMask] = data.slice(i, i + 5);
        line += dLine;
        col = dLine > 0 ? dStart : col + dStart;
        const src = lines[line];
        if (src === undefined) throw new Error(`semantic token #${i / 5} points past EOF (line ${line + 1})`);
        const text = src.slice(col, col + length);
        if (text.length !== length) {
            throw new Error(
                `semantic token #${i / 5} at ${line + 1}:${col + 1} runs past end of line ` +
                `(multi-line token or position-encoding mismatch)`
            );
        }
        const mods: string[] = [];
        for (let bit = 0; bit < 31; bit++) {
            if (modMask & (1 << bit)) mods.push(legend.tokenModifiers[bit] ?? `mod#${bit}`);
        }
        out.push({
            line: line + 1,
            col: col + 1,
            end: col + 1 + length,
            text,
            type: legend.tokenTypes[typeIdx] ?? `type#${typeIdx}`,
            mods,
        });
    }
    return out;
}

/**
 * Poll until two consecutive responses are identical (and non-empty unless allowed).
 * Servers differ in how they signal "still loading": empty result, ContentModified, or a
 * first answer computed from a partial AST. Stability is the only signal that works everywhere.
 */
async function stableTokens(conn: LspConnection, uri: string, policy: ReadyPolicy): Promise<number[]> {
    const deadline = Date.now() + policy.timeoutMs;
    let prev: string | undefined;
    let lastCount = 0;
    for (; ;) {
        try {
            const left = Math.max(1_000, deadline - Date.now());
            const res = await conn.request<{ data?: number[] } | null>(
                'textDocument/semanticTokens/full',
                { textDocument: { uri } },
                left
            );
            const data = res?.data ?? [];
            const key = data.join(',');
            if (key === prev && (data.length > 0 || policy.allowEmpty)) return data;
            prev = key;
            lastCount = data.length / 5;
        } catch (e) {
            if (!(e instanceof LspError && RETRYABLE.has(e.code))) throw e;
        }
        if (Date.now() >= deadline) {
            throw new Error(
                `semantic tokens did not stabilise within ${policy.timeoutMs}ms (last response: ${lastCount} tokens). ` +
                `Output would be non-deterministic, so none is produced.`
            );
        }
        await sleep(policy.intervalMs);
    }
}

export function lspProvider(spec: LspSpec): SemanticProvider {
    return async (req) => {
        let workspace: string;
        let docPath: string;
        let tmp: string | undefined;
        if (spec.scaffold) {
            tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tokdump-'));
            const name = path.basename(req.fixturePath);
            for (const [rel, content] of Object.entries(spec.scaffold({ fixtureName: name }))) {
                const file = path.join(tmp, rel);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, content);
            }
            docPath = path.join(tmp, name);
            fs.writeFileSync(docPath, req.text);
            workspace = tmp;
        } else {
            workspace = path.dirname(req.fixturePath);
            docPath = req.fixturePath;
        }

        const rootUri = pathToFileURL(workspace).href;
        const docUri = pathToFileURL(docPath).href;
        const folders = [{ uri: rootUri, name: path.basename(workspace) }];
        const conn = new LspConnection({
            cmd: spec.cmd,
            cwd: workspace,
            settings: spec.settings,
            workspaceFolders: folders,
            requestTimeoutMs: spec.requestTimeoutMs,
        });
        try {
            const tokenTypes = [...new Set([...BASE_TYPES, ...req.extraTypes, ...(spec.extraTokenTypes ?? [])])];
            const tokenModifiers = [...new Set([...BASE_MODIFIERS, ...req.extraModifiers, ...(spec.extraTokenModifiers ?? [])])];
            const init = await conn.request<any>('initialize', {
                processId: process.pid,
                clientInfo: { name: 'tokdump' },
                rootUri,
                workspaceFolders: folders,
                initializationOptions: spec.initOptions,
                capabilities: {
                    general: { positionEncodings: ['utf-16'] },
                    window: { workDoneProgress: true },
                    workspace: { configuration: true, workspaceFolders: true, semanticTokens: { refreshSupport: true } },
                    textDocument: {
                        synchronization: {},
                        semanticTokens: {
                            requests: { full: true },
                            tokenTypes,
                            tokenModifiers,
                            formats: ['relative'],
                            overlappingTokenSupport: false,
                            multilineTokenSupport: false,
                            serverCancelSupport: true,
                            augmentsSyntaxTokens: true, // semantic tokens overlay TextMate, as in VSCode
                        },
                    },
                },
            });
            conn.notify('initialized', {});

            const enc = init.capabilities?.positionEncoding ?? 'utf-16';
            if (enc !== 'utf-16') throw new Error(`server chose position encoding ${enc}; tokdump only supports utf-16`);
            const provider = init.capabilities?.semanticTokensProvider;
            if (!provider?.legend) {
                throw new Error(
                    'server does not advertise semanticTokensProvider. Usually a missing setting/initOptions ' +
                    '(e.g. gopls ui.semanticTokens) or a server that has no semantic tokens at all.\n' +
                    `[server log]\n${conn.serverLog.join('\n')}`
                );
            }
            const legend = { tokenTypes: provider.legend.tokenTypes as string[], tokenModifiers: provider.legend.tokenModifiers as string[] };

            conn.notify('textDocument/didOpen', {
                textDocument: { uri: docUri, languageId: req.languageId, version: 1, text: req.text },
            });
            const data = await stableTokens(conn, docUri, { ...DEFAULT_READY, ...spec.ready });
            return {
                tokens: decodeSemanticTokens(data, legend, splitLines(req.text)),
                server: { name: init.serverInfo?.name ?? null, version: init.serverInfo?.version ?? null },
                legend,
            };
        } finally {
            await conn.close();
            if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
        }
    };
}
