import type { Hue } from './palette'

// Role = meaning (language-agnostic). Hue = presentation.
export const roles = {
    affix: 'orange',  // number prefix/suffix
    attribute: 'cyan',
    comment: 'gray',
    declarator: 'orange',  // pointer/reference declrator: * &
    enumMember: 'fg',
    escape: 'red',
    function: 'blue',
    keyword: 'purple',
    macro: 'blue',
    number: 'yellow',
    operator: 'orange',
    parameter: 'cyan',
    placeholder: 'red',
    plain: 'fg',
    string: 'green',
    type: 'yellow',  // explicit "no color"
} as const satisfies Record<string, Hue>;

export type Role = keyof typeof roles;

export const fontStyles: Partial<Record<Role, 'italic' | 'bold' | 'underline'>> = {
    comment: 'italic',
};

// tm: TextMate scope selectors (prefix match, deeper selector wins)
// semantic: LSP selectors `type[.modifier]*`
export type Binding = { tm?: readonly string[]; semantic?: readonly string[] };
export type Bindings = Partial<Record<Role, Binding>>;
