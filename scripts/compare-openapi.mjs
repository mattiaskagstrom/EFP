import { readFile } from 'node:fs/promises';

const [baselinePath, currentPath] = process.argv.slice(2);
if (!baselinePath || !currentPath) {
  console.error('Usage: node scripts/compare-openapi.mjs baseline.json current.json');
  process.exit(2);
}

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const current = JSON.parse(await readFile(currentPath, 'utf8'));
const expected = baseline.paths;
const actual = current.paths ?? {};
const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
const missingPaths = Object.keys(expected).filter(path => !actual[path]);
const missingMethods = Object.entries(expected).flatMap(([path, expectedMethods]) =>
  expectedMethods.filter(method => !actual[path] || !methods.has(method) || !actual[path][method]).map(method => `${path} ${method}`));

if (missingPaths.length || missingMethods.length) {
  console.error('OpenAPI v1 contract changed:');
  missingPaths.forEach(path => console.error(`  missing path: ${path}`));
  missingMethods.forEach(method => console.error(`  missing method: ${method}`));
  process.exit(1);
}

console.log(`OpenAPI v1 contract OK (${Object.keys(expected).length} paths checked).`);
