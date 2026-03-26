import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'build');
mkdirSync(outDir, { recursive: true });
const pngPath = join(root, 'assets', 'icon.png');
const buf = await pngToIco(readFileSync(pngPath));
writeFileSync(join(outDir, 'icon.ico'), buf);
console.log('Wrote build/icon.ico (%d bytes)', buf.length);
