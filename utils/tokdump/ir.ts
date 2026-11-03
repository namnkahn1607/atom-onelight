/**
 * tokdump IR (schema "tokdump/1").
 *
 * Coordinates: `line` and `col` are 1-based, `end` is the EXCLUSIVE 1-based column, so a
 * token occupies [col, end). Columns count UTF-16 code units, which is simultaneously the
 * LSP default position encoding, the unit of vscode-textmate's startIndex/endIndex, and the
 * unit of JS string indexing. No unit conversion exists anywhere in the pipeline.
 *
 * Two layers are kept strictly separate:
 *   - TextMate: an ordered scope stack per token (scopes[0] is the grammar's root scope).
 *   - Semantic: (type, modifiers) per token. VSCode matches these against the theme's
 *     semanticTokenColors; they are NOT scopes and are never merged into the scope stack.
 * They are only related by character ranges (see join.ts).
 */

export const SCHEMA = 'tokdump/1';

export interface Span {
    line: number;
    col: number;
    end: number;
}

export interface TmToken extends Span {
    text: string;
    /** Outermost first. scopes[0] is the root scope of the grammar (e.g. source.cpp). */
    scopes: string[];
}

export interface SemToken extends Span {
    text: string;
    type: string;
    /** In the server's legend order. Never filtered here; filtering is a render concern. */
    mods: string[];
}

/** A semantic token as seen from a TextMate token: same line implied. */
export interface SemRef {
    type: string;
    mods: string[];
    col: number;
    end: number;
}

/**
 * How the semantic token(s) overlapping a TextMate token relate to it.
 *   exact      one semantic token, identical range
 *   sem-wider  one semantic token that strictly contains the TM token
 *   tm-wider   one semantic token strictly inside the TM token
 *   partial    one semantic token straddling a TM boundary
 *   multi      two or more semantic tokens overlap the TM token
 *   none       no semantic token overlaps (TM style applies unchanged)
 */
export type Relation = 'exact' | 'sem-wider' | 'tm-wider' | 'partial' | 'multi' | 'none';

export const RELATIONS: readonly Relation[] = ['exact', 'sem-wider', 'tm-wider', 'partial', 'multi', 'none'];

export interface JoinedToken extends TmToken {
    rel: Relation;
    sem: SemRef[];
}

export interface Coverage {
    tmTokens: number;
    semTokens: number;
    relations: Record<Relation, number>;
    /** Semantic tokens that overlap no TextMate token. Should be 0; non-zero means a position bug. */
    orphanSemTokens: number;
}

export interface Meta {
    lang: string;
    languageId: string;
    fixture: string;
    fixtureSha256: string;
    fixtureLines: number;
    grammar: {
        source: 'local' | 'github' | 'mixed';
        vscodeCommit: string | null;
        rootScope: string;
        roots: string[];
        extensionsIndexed: number;
    };
    /** false when the language has no LSP spec (or --no-lsp). */
    semantic:
    | false
    | {
        server: { name: string | null; version: string | null };
        cmd: string[];
        tokenCount: number;
        legendTypes: string[];
        legendModifiers: string[];
    };
}

export interface Dump {
    schema: typeof SCHEMA;
    meta: Meta;
    coverage: Coverage;
    unresolvedScopes: string[];
    orphans: SemToken[];
    tokens: JoinedToken[];
}

/** Same line terminators as LSP: \r\n, \r, \n. Never use str.splitlines()-style splitting. */
export function splitLines(text: string): string[] {
    return text.split(/\r\n|\r|\n/);
}