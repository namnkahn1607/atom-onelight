import * as fs from 'node:fs';
import * as path from 'node:path';
import { Resvg } from '@resvg/resvg-js'

const SIZE = 256;
const png = new Resvg(fs.readFileSync(path.resolve('assets/logo.svg')), {
    fitTo: { mode: 'width', value: SIZE },
    font: { loadSystemFonts: false },
}).render()
fs.writeFileSync(path.resolve('assets/logo.png'), png.asPng());
console.error(`wrote assets/icon.png (${png.width}x${png.height})`);
