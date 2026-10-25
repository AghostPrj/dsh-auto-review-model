#!/usr/bin/env node
/**
 * Static and smoke verification for `@local/dsh-auto-review-model`.
 *
 * This script does not install anything and never invokes pnpm/DSH commands.
 * It checks the package metadata, the Cordis patch, the host/client source
 * invariants the plugin relies on, that the development schemastery link is
 * importable, and that all three JavaScript entries parse. It also re-reads the
 * installed experimental auto-review source to confirm the fixed policy prefix
 * and marker sentence the host listener keys on are still present.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Compiled file lives at .build/scripts/verify.js, so ROOT is ../../
const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const PACKAGE_NAME = '@local/dsh-auto-review-model';
const TARGET_BUNDLE = '@deepseek-ai/dsh-experimental-auto-review';
const SETTINGS_NS = 'auto-review-model';
const REVIEW_POLICY_PREFIX = 'REVIEW_POLICY\n';
const REVIEW_POLICY_MARKER =
  'You are the final authorization reviewer for exactly one pending tool call.';
const INSTALLED_AUTO_REVIEW =
  '/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-experimental-auto-review/lib/index.js';

interface Failure {
  label: string;
  message: string;
}

const failures: Failure[] = [];
let passed = 0;

function read(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(label: string, callback: () => string | void | Promise<string | void>): Promise<void> {
  try {
    const detail = await callback();
    passed += 1;
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ label, message });
    console.error(`FAIL  ${label}`);
    console.error(`      ${message}`);
  }
}

/** Resolve one `exports` entry, which may be a string or a conditions object. */
function exportTarget(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  if (entry === null || typeof entry !== 'object') return '';
  const obj = entry as Record<string, unknown>;
  for (const condition of ['default', 'import', 'node', 'require']) {
    const target = exportTarget(obj[condition]);
    if (target !== '') return target;
  }
  return '';
}

function sameRelativeTarget(target: string, expected: string): boolean {
  return target.replace(/^\.\//, '') === expected;
}

function packageJson(): Record<string, any> {
  return JSON.parse(read('package.json'));
}

await check('package.json identity and entry metadata', () => {
  const pkg = packageJson();
  assert(pkg.name === PACKAGE_NAME, `name must be ${PACKAGE_NAME}, got ${pkg.name}`);
  assert(pkg.version === '0.1.0', `version must be 0.1.0, got ${pkg.version}`);
  assert(pkg.type === 'module', `type must be module, got ${pkg.type}`);
  assert(pkg.main === 'lib/index.js', `main must be lib/index.js, got ${pkg.main}`);
  return `${pkg.name}@${pkg.version}`;
});

await check('package.json exports cover host, policy, client and patch files', () => {
  const { exports } = packageJson();
  assert(exports !== null && typeof exports === 'object', 'exports must be an object');
  assert(
    sameRelativeTarget(exportTarget(exports['.']), 'lib/index.js'),
    'exports["."] must resolve to ./lib/index.js',
  );
  assert(
    Object.hasOwn(exports, './policy'),
    'exports must expose ./policy',
  );
  assert(
    sameRelativeTarget(exportTarget(exports['./policy']), 'lib/policy.js'),
    'exports["./policy"] must resolve to ./lib/policy.js',
  );
  assert(
    sameRelativeTarget(exportTarget(exports['./client']), 'client/client.js'),
    'exports["./client"] must resolve to ./client/client.js',
  );
  assert(
    Object.hasOwn(exports, './cordis.patch.yml'),
    'exports must expose ./cordis.patch.yml',
  );
  assert(Object.hasOwn(exports, './package.json'), 'exports must expose ./package.json');
  return 'exports: ., ./policy, ./client, ./cordis.patch.yml, ./package.json';
});

await check('package.json does not reference missing client runtime/ui-slots packages', () => {
  const pkg = packageJson();
  const serialized = JSON.stringify(pkg);
  assert(
    !serialized.includes('dsh-client-runtime'),
    'package.json must not reference @deepseek-ai/dsh-client-runtime',
  );
  assert(
    !serialized.includes('dsh-client-ui-slots'),
    'package.json must not reference @deepseek-ai/dsh-client-ui-slots',
  );
  return 'no dsh-client-runtime or dsh-client-ui-slots';
});

await check('package.json dsh bundle/client declarations and schemastery dependency', () => {
  const pkg = packageJson();
  assert(
    pkg.dsh?.bundle?.patch === './cordis.patch.yml',
    'dsh.bundle.patch must be ./cordis.patch.yml',
  );
  assert(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform must be web');
  const schemastery = pkg.dependencies?.['@deepseek-ai/schemastery'];
  assert(
    typeof schemastery === 'string' && schemastery.trim() !== '',
    'dependencies["@deepseek-ai/schemastery"] must be a non-empty version string',
  );
  return `schemastery ${schemastery}`;
});

await check('cordis.patch.yml declares the loader row', () => {
  const yml = read('cordis.patch.yml');
  assert(
    /^\s*-\s*id:\s*['"]?auto-review-model['"]?\s*$/m.test(yml),
    'cordis.patch.yml must contain "id: auto-review-model"',
  );
  assert(
    /^\s*name:\s*['"]@local\/dsh-auto-review-model['"]\s*$/m.test(yml),
    "cordis.patch.yml must contain name '@local/dsh-auto-review-model'",
  );
  return 'id auto-review-model';
});

await check('lib/policy.js keeps the REVIEW_POLICY prefix and marker sentence', () => {
  const source = read('lib/policy.js');
  assert(source.includes('REVIEW_POLICY'), 'lib/policy.js must define REVIEW_POLICY');
  assert(
    /REVIEW_POLICY(?:\\n|\r?\n)/.test(source),
    'lib/policy.js must define the "REVIEW_POLICY\\n" prefix',
  );
  assert(
    source.includes(REVIEW_POLICY_MARKER),
    'lib/policy.js must keep the fixed reviewer marker sentence',
  );
  return 'prefix + marker';
});

await check('lib/index.js installs the llm/stream waterfall with recursion guard', () => {
  const source = read('lib/index.js');
  assert(source.includes('llm/stream'), 'lib/index.js must listen on llm/stream');
  assert(source.includes('WeakSet'), 'lib/index.js must guard re-entry with WeakSet');
  return 'llm/stream + WeakSet';
});

await check('client/client.js targets the auto-review bundle settings namespace', () => {
  const source = read('client/client.js');
  assert(
    source.includes(TARGET_BUNDLE),
    `client/client.js must contain TARGET_BUNDLE ${TARGET_BUNDLE}`,
  );
  assert(
    source.includes(SETTINGS_NS),
    `client/client.js must contain SETTINGS_NS ${SETTINGS_NS}`,
  );
  assert(
    source.includes('plugins.bundle.config'),
    'client/client.js must register into plugins.bundle.config',
  );
  return `${TARGET_BUNDLE} / ${SETTINGS_NS}`;
});

await check('node_modules/@deepseek-ai/schemastery is importable', async () => {
  const schemastery = await import('@deepseek-ai/schemastery');
  const z = (schemastery as any).default ?? schemastery;
  assert(z !== null && z !== undefined, 'schemastery module has no exports');
  assert(typeof z.object === 'function', 'schemastery exports must provide z.object');
  return 'z.object available';
});

for (const relativePath of ['lib/index.js', 'lib/policy.js', 'client/client.js']) {
  await check(`${relativePath} exists and passes node --check`, () => {
    const fullPath = path.join(ROOT, relativePath);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      throw new Error(`file ${relativePath} does not exist at ${fullPath}`);
    }
    assert(stat.isFile(), `${relativePath} is not a regular file`);
    const result = spawnSync(
      process.execPath,
      ['--check', fullPath],
      { cwd: ROOT, encoding: 'utf8' },
    );
    assert(result.error === undefined, `could not spawn node --check: ${result.error}`);
    assert(
      result.status === 0,
      `node --check failed for ${relativePath}:\n${(result.stderr || result.stdout).trim()}`,
    );
    return 'syntax ok';
  });
}

await check('tests directory contains at least one *.test.ts', () => {
  const testsDir = path.join(ROOT, 'tests');
  let files: string[] = [];
  try {
    files = readdirSync(testsDir);
  } catch (error) {
    throw new Error(`cannot read tests directory: ${error}`);
  }
  const testFiles = files.filter((f) => f.endsWith('.test.ts'));
  assert(
    testFiles.length > 0,
    `tests directory must contain at least one *.test.ts, found: ${files.join(', ') || 'none'}`,
  );
  return `${testFiles.length} test file(s): ${testFiles.join(', ')}`;
});

await check('tests/ and scripts/ contain no lingering *.mjs files', () => {
  for (const dirName of ['tests', 'scripts']) {
    const dirPath = path.join(ROOT, dirName);
    let files: string[] = [];
    try {
      files = readdirSync(dirPath);
    } catch {
      continue;
    }
    const mjsFiles = files.filter((f) => f.endsWith('.mjs'));
    assert(
      mjsFiles.length === 0,
      `${dirName}/ must not contain *.mjs files, found: ${mjsFiles.join(', ')}`,
    );
  }
  return 'no *.mjs found in tests/ or scripts/';
});

await check('installed experimental-auto-review still carries the fixed policy', () => {
  const source = readFileSync(INSTALLED_AUTO_REVIEW, 'utf8');
  const assignment = source.match(/REVIEW_POLICY\s*=\s*`([\s\S]*?)`/);
  assert(assignment, `could not find the REVIEW_POLICY template in ${INSTALLED_AUTO_REVIEW}`);
  assert(
    assignment[1].startsWith(REVIEW_POLICY_PREFIX),
    'installed REVIEW_POLICY no longer starts with the "REVIEW_POLICY\\n" prefix',
  );
  assert(
    assignment[1].includes(REVIEW_POLICY_MARKER),
    'installed REVIEW_POLICY no longer contains the reviewer marker sentence',
  );
  return path.basename(path.dirname(path.dirname(INSTALLED_AUTO_REVIEW)));
});

if (failures.length > 0) {
  console.error(`\n${failures.length} of ${passed + failures.length} checks failed:`);
  for (const failure of failures) console.error(`  - ${failure.label}: ${failure.message}`);
  process.exit(1);
}

console.log(`\nAll ${passed} checks passed.`);
process.exit(0);
