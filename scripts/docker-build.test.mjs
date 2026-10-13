import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFileSync(path.join(root, file), 'utf8');

test('admin Docker context excludes host dependencies and generated bundles', () => {
  const ignore = existsSync(path.join(root, '.dockerignore')) ? read('.dockerignore').split(/\r?\n/) : [];
  for (const pattern of ['**/node_modules', '**/dist']) {
    assert.ok(ignore.includes(pattern), `Docker must exclude ${pattern} so COPY cannot overwrite container-built files`);
  }
});

test('admin Docker dependency layer includes every workspace manifest in the lockfile', () => {
  const beforeInstall = read('src/Admin/Dockerfile').split('RUN pnpm install --frozen-lockfile')[0];
  const copied = new Set();
  for (const line of beforeInstall.split(/\r?\n/)) {
    if (!line.startsWith('COPY ')) continue;
    const parts = line.trim().split(/\s+/).slice(1);
    const destination = parts.pop();
    for (const source of parts) {
      copied.add(destination.endsWith('/') ? path.posix.join(destination, path.posix.basename(source)) : destination);
    }
  }
  const importers = read('pnpm-lock.yaml').split('importers:')[1].split('\npackages:')[0];
  for (const match of importers.matchAll(/^  ([^\s]+):\r?$/gm)) {
    const manifest = path.posix.join(match[1], 'package.json');
    assert.ok(copied.has(manifest), `${manifest} must be copied before the frozen install`);
  }
});

test('Docker and CI use the same explicit pnpm version', () => {
  const { packageManager } = JSON.parse(read('package.json'));
  assert.match(packageManager ?? '', /^pnpm@\d+\.\d+\.\d+$/, 'Pin pnpm in the root package.json for Corepack');
  const version = packageManager.slice('pnpm@'.length);
  for (const file of ['.github/workflows/ci-fast.yml', '.github/workflows/ci-full-e2e.yml']) {
    assert.match(read(file), new RegExp(`version: ['"]?${version.replaceAll('.', '\\.')}['"]?\\s*(?:\\r?\\n|$)`), `${file} must use ${version}`);
  }
});
