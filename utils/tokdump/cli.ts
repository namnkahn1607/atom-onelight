#!/usr/bin/env -S npx tsx
/**
 * tokdump <lang> <fixture> [options]
 *
 * Produces ONE joined token table (TextMate scopes + LSP semantic tokens when the language
 * has a server) for any language registered in langs.ts.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { buildIndex, resolveRootScope, resolveSource } from './grammar-source';
import { splitLines, SCHEMA, type Dump, type SemToken } from './ir';
import { joinTokens } from './join';
import { LANGS } from './langs';
import { DEFAULT_HIDE_MODS, renderJson, renderMarkdown, type View } from './render';
import { lspProvider, type SemanticResult } from './semantic';
import { tokenizeTextMate } from './textmate';

const USAGE = `usage: tokdump <lang> <fixture> [options]

  --format=md|json       output format (default md)
  --view=summary,tokens  markdown views (default summary)
  --depth=N              innermost scopes per row, 0 = all (default 2)
  --out=FILE             write to FILE instead of stdout
  --no-lsp               skip the semantic layer even if the language has a server
  --all-mods             do not hide declaration/definition/*Scope modifiers in labels

  grammar source (layers of one index; later layers override earlier ones):
  --source=auto|local|github   auto = GitHub built-ins (needs commit) layered under local extension dirs
  --ext-dir=DIR          extension directory (repeatable; replaces the default local dirs)
  --commit=SHA           40-hex VSCode commit (env VSCODE_COMMIT; default: code --version)
  --cache=DIR            github cache (default .cache/vscode-ext)

  --list                 list registered languages`;

async function main(): Promise<void> {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            format: { type: 'string', default: 'md' },
            view: { type: 'string', default: 'summary' },
            depth: { type: 'string', default: '2' },
            out: { type: 'string' },
            'no-lsp': { type: 'boolean', default: false },
            'all-mods': { type: 'boolean', default: false },
            source: { type: 'string', default: 'auto' },
            'ext-dir': { type: 'string', multiple: true, default: [] },
            commit: { type: 'string' },
            cache: { type: 'string', default: '.cache/vscode-ext' },
            list: { type: 'boolean', default: false },
            help: { type: 'boolean', default: false },
        },
    });
    if (values.help) return void console.log(USAGE);
    if (values.list) {
        for (const [id, s] of Object.entries(LANGS)) console.log(`${id.padEnd(10)} ${s.languageId.padEnd(12)} ${s.lsp ? s.lsp.cmd[0] : 'textmate only'}`);
        return;
    }

    const [langId, fixtureArg] = positionals;
    if (!langId || !fixtureArg) throw new Error(USAGE);
    const spec = LANGS[langId];
    if (!spec) throw new Error(`unknown language "${langId}". registered: ${Object.keys(LANGS).join(', ')}`);

    const format = values.format;
    if (format !== 'md' && format !== 'json') throw new Error(`--format must be md or json`);
    const views = (values.view as string).split(',').map((v) => v.trim()).filter(Boolean) as View[];
    for (const v of views) if (v !== 'summary' && v !== 'tokens') throw new Error(`unknown view "${v}"`);
    const depth = Number(values.depth);
    if (!Number.isInteger(depth) || depth < 0) throw new Error('--depth must be an integer >= 0');
    const mode = values.source as 'auto' | 'local' | 'github';
    if (!['auto', 'local', 'github'].includes(mode)) throw new Error('--source must be auto, local or github');

    // fixture: BOM stripped once so every layer sees identical text
    const fixturePath = path.resolve(fixtureArg);
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const lines = splitLines(text);

    // 1. TextMate
    const source = await resolveSource({ mode, extDirs: values['ext-dir'] as string[], commit: values.commit, cacheDir: values.cache as string }, spec);
    const index = buildIndex(source.roots);
    for (const w of index.warnings) console.error(`warn: ${w}`);
    const rootScope = resolveRootScope(index, spec);
    const { tokens: tm, unresolved } = await tokenizeTextMate(lines, index, rootScope);

    // 2. Semantic (optional)
    let sem: SemToken[] = [];
    let semantic: SemanticResult | undefined;
    if (spec.lsp && !values['no-lsp']) {
        semantic = await lspProvider(spec.lsp)({
            languageId: spec.languageId,
            fixturePath,
            text,
            extraTypes: index.semanticTypes,
            extraModifiers: index.semanticModifiers,
        });
        sem = semantic.tokens;
    }

    // 3. Join + render
    const { tokens, orphans, coverage } = joinTokens(tm, sem);
    const dump: Dump = {
        schema: SCHEMA,
        meta: {
            lang: langId,
            languageId: spec.languageId,
            fixture: path.relative(process.cwd(), fixturePath) || fixtureArg,
            fixtureSha256: crypto.createHash('sha256').update(text).digest('hex'),
            fixtureLines: lines.length,
            grammar: {
                source: source.mode,
                vscodeCommit: source.commit,
                rootScope,
                roots: source.roots,
                extensionsIndexed: index.extensionCount,
            },
            semantic: semantic
                ? {
                    server: semantic.server,
                    cmd: spec.lsp!.cmd,
                    tokenCount: sem.length,
                    legendTypes: semantic.legend.tokenTypes,
                    legendModifiers: semantic.legend.tokenModifiers,
                }
                : false,
        },
        coverage,
        unresolvedScopes: unresolved,
        orphans,
        tokens,
    };
    const ro = { depth, views, hideMods: values['all-mods'] ? /(?!)/ : DEFAULT_HIDE_MODS };
    const output = format === 'json' ? renderJson(dump, ro) : renderMarkdown(dump, ro);
    if (values.out) fs.writeFileSync(values.out, output);
    else process.stdout.write(output);

    console.error(`grammar: ${source.mode} ${source.commit?.slice(0, 8) ?? ''} ${rootScope}`);
    console.error(`TM tokens: ${tm.length}, semantic tokens: ${sem.length}, orphans: ${orphans.length}`);
    if (unresolved.length) console.error(`unresolved grammar includes: ${unresolved.join(', ')}`);
    if (orphans.length) process.exitCode = 2; // join integrity violated: do not trust the table
}

main().catch((e) => {
    console.error(String((e as Error).message ?? e));
    process.exit(1);
});