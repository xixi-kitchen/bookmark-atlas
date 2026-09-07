import { mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const root = new URL('..', import.meta.url);
const assetDir = resolve(root.pathname, 'docs/store-assets');

const outputs = [
  ['promo-source.svg', 'promo-440x280.png', 440, 280],
  ['marquee-source.svg', 'marquee-1400x560.png', 1400, 560],
];

for (const [sourceName, outputName, width, height] of outputs) {
  const source = resolve(assetDir, sourceName);
  const output = resolve(assetDir, outputName);
  await renderRgbPng(source, output, width, height);
}

await renderTransparentPng(
  resolve(assetDir, 'icon-source.svg'),
  resolve(assetDir, 'icon-128.png'),
  128,
  128,
);

for (const size of [16, 32, 48, 128]) {
  await renderTransparentPng(
    resolve(assetDir, 'icon-source.svg'),
    resolve(root.pathname, `public/icons/icon-${size}.png`),
    size,
    size,
  );
}

async function renderTransparentPng(source, output, width, height) {
  await mkdir(dirname(output), { recursive: true });
  await execFileAsync('magick', [source, '-resize', `${width}x${height}!`, '-strip', output]);
}

async function renderRgbPng(source, output, width, height) {
  await mkdir(dirname(output), { recursive: true });
  await execFileAsync('magick', [
    source,
    '-resize',
    `${width}x${height}!`,
    '-background',
    '#6965db',
    '-alpha',
    'remove',
    '-alpha',
    'off',
    '-strip',
    '-define',
    'png:color-type=2',
    output,
  ]);
}
