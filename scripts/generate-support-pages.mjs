import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseProjectSupportConfig } from '../src/support/config.mjs';
import { renderProjectSupportPage, updateHomepageSupportSlot } from './lib/support-pages.mjs';

let root = fileURLToPath(new URL('../', import.meta.url));
let check = false;
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--check') check = true;
  else if (args[index] === '--root' && args[index + 1] && !args[index + 1].startsWith('--')) root = resolve(args[++index]);
  else throw new Error(`Unknown or incomplete option: ${args[index]}`);
}
const read = (path) => readFile(resolve(root, path), 'utf8');
const [source, home, chineseHome] = await Promise.all([
  read('src/support/support.config.json'), read('docs/index.html'), read('docs/zh/index.html'),
]);
const config = parseProjectSupportConfig(JSON.parse(source));
// All input validation and all target comparisons precede any write.
// This script never reads or copies private QR originals or publishes files.
const outputs = [
  ['docs/index.html', updateHomepageSupportSlot(home, config)],
  ['docs/zh/index.html', updateHomepageSupportSlot(chineseHome, config, 'zh-CN')],
  ['docs/support-project.html', renderProjectSupportPage(config)],
  ['docs/zh/support-project.html', renderProjectSupportPage(config, 'zh-CN')],
];
const pending = [];
for (const [path, expected] of outputs) {
  let current;
  try { current = await read(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (current !== expected) pending.push([path, expected]);
}
if (check && pending.length) throw new Error(`Stale project support content: ${pending[0][0]}. Run npm run support:generate.`);
for (const [path, expected] of pending) {
  await mkdir(dirname(resolve(root, path)), { recursive: true });
  await writeFile(resolve(root, path), expected, 'utf8');
}
console.log(check ? 'Project support content is current.' : `Project support content generated (${config.enabled ? 'enabled' : 'disabled'}).`);
