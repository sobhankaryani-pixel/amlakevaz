import {existsSync, lstatSync, readdirSync, readFileSync, unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const visual = join(root, 'frontend/public/visual');
const retired = [
  'evaz-desktop-villa.webp',
  'evaz-inspired-hero.png',
  'evaz-satellite-preview-v1.png',
  'hero-top-desktop-v2.png',
  'hero-unified-desktop.png',
  'hero-unified-mobile-v2.png',
  'hero-unified-mobile.png',
  'hero-villas-02-desktop.webp',
  'hero-villas-02-mobile.webp',
  'hero-villas-03-mobile.webp',
];
const sourceExtension = /\.(?:[cm]?[jt]sx?|css|html|json|svg|py)$/i;
const ignored = new Set(['node_modules', 'dist', '__pycache__', 'tests']);

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !ignored.has(entry.name) && !entry.name.startsWith('.')) {
      yield* sourceFiles(path);
    } else if (entry.isFile() && sourceExtension.test(entry.name)) {
      yield path;
    }
  }
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--apply')) {
  console.error('Usage: node cleanup-old-images.mjs [--apply]');
  process.exit(1);
}
const apply = args[0] === '--apply';
if (!existsSync(join(root, 'frontend/index.html')) || !existsSync(visual) || !lstatSync(visual).isDirectory()) {
  console.error('Put this script in the project root beside frontend/.');
  process.exit(1);
}

const sources = ['frontend', 'admin', 'backend/app'].flatMap(path => {
  const directory = join(root, path);
  return existsSync(directory) ? [...sourceFiles(directory)] : [];
});
sources.push(join(root, 'build-liara.mjs'));
const referenced = new Set();
for (const path of sources) {
  if (!existsSync(path)) continue;
  const content = readFileSync(path, 'utf8');
  for (const name of retired) if (content.includes(name)) referenced.add(name);
}

let count = 0;
for (const name of retired) {
  const path = join(visual, name);
  if (!existsSync(path) || !lstatSync(path).isFile()) continue;
  if (referenced.has(name)) {
    console.log('KEEP (referenced): frontend/public/visual/' + name);
    continue;
  }
  if (apply) unlinkSync(path);
  console.log((apply ? 'REMOVED: ' : 'WOULD REMOVE: ') + 'frontend/public/visual/' + name);
  count++;
}
console.log(apply ? `Removed ${count} file(s).` : `${count} candidate(s). Run with --apply to remove them.`);
