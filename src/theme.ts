import { palette } from "./palette";
import { fontStyles, roles, type Bindings, type Role } from "./roles";

export type TokenColor = {
    name?: string;
    scope?: string[]; 
    settings: { foreground?: string; fontStyle?: string }
};
export type Theme = {
    $schema: string;
    name: string;
    author: string;
    type: 'light';
    semanticHighlighting: true;
    colors: Record<string, string>;
    semanticTokenColors: Record<string, string>;
    tokenColors: TokenColor[];
};

export const THEME_NAME = "Atom's One Light";
export const AUTHOR = 'namnkahn1607';

function claim(seen: Map<string, Role>, selector: string, role: Role, where: string) {
    const prev = seen.get(selector);
    if (prev && prev !== role) {
        throw new Error(`selector "${selector}" bound to both "${prev}" and "${role}" (${where})`);
    }
    seen.set(selector, role);
}

// Pure function: bindings + a role->color function => theme.
// Verification reuses it with sentinel colors.
export function buildTheme(langs: Record<string, Bindings>, colorOf: (role: Role) => string): Theme {
    const tm = new Map<Role, Set<string>>();
    const sem = new Map<string, Role>();
    const seenTm = new Map<string, Role>();
    for (const [lang, bindings] of Object.entries(langs)) {
        for (const role of Object.keys(bindings) as Role[]) {
            const b = bindings[role]!;
            for (const s of b.tm ?? []) {
                claim(seenTm, s, role, lang); (tm.get(role) ?? tm.set(role, new Set()).get(role)!).add(s);
            }
            for (const s of b.semantic ?? []) {
                claim(sem, s, role, lang);
            }
        }
    }
    const tokenColors: TokenColor[] = [{ settings: { foreground: colorOf('plain') } }];
    for (const role of Object.keys(roles) as Role[]) {
        const scopes = tm.get(role);
        if (scopes?.size) {
            tokenColors.push({
                name: role,
                scope: [...scopes].sort(),
                settings: {
                    foreground: colorOf(role),
                    ...(fontStyles[role] && { fontStyle: fontStyles[role] })
                }
            });
        }
    }

    const bracketLevels = Object.fromEntries(
        [1, 2, 3, 4, 5, 6].map((i) => [`editorBracketHighlight.foreground${i}`, palette.fg])
    )

    const semanticTokenColors: Record<string, string> = {};
    for (const [selector, role] of [...sem].sort(([a], [b]) => a.localeCompare(b))) {
        semanticTokenColors[selector] = colorOf(role);
    }

    return {
        $schema: 'vscode://schemas/color-theme',
        name: THEME_NAME,
        author: AUTHOR,
        type: 'light',
        semanticHighlighting: true,
        colors: {
            'editor.background': palette.bg,
            'editor.foreground': palette.fg,
            ...bracketLevels
        },
        semanticTokenColors,
        tokenColors,
    };
}

export const hexOf = (role: Role) => palette[roles[role]];
