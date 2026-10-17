import * as fs from 'node:fs';
import * as path from 'node:path';
import { langs } from './langs';
import { buildTheme, hexOf } from './theme';

const out = path.resolve('themes/atom-onelight.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(buildTheme(langs, hexOf), null, 2) + '\n');
console.error(`wrote ${path.relative('.', out)}`);
