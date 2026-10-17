// Single source of truth for hex values.
export const palette = {
    bg: '#eff1f5',
    fg: '#383a42',
    blue: '#4078f2',
    cyan: '#0184bc',
    gray: '#a0a1a7',
    green: '#50a14f',
    orange: '#e45649',
    purple: '#a626a4',
    red: '#ca1243',
    yellow: '#df8e1d',
} as const;

export type Hue = keyof typeof palette;
