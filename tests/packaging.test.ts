/**
 * Packaging tests for `@local/dsh-auto-review-model`.
 *
 * Verifies package manifest, Cordis patch specification, build artifacts,
 * and client/host entrypoints to ensure correct packaging and plugin registration.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgPath = fileURLToPath(import.meta.resolve('@local/dsh-auto-review-model/package.json'));
const PKG_ROOT = path.dirname(pkgPath);

test('package.json exports and metadata match plugin requirements', () => {
  const pkgPath = path.join(PKG_ROOT, 'package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json must exist');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.equal(pkg.name, '@local/dsh-auto-review-model');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.main, 'lib/index.js');

  const exportsMap = pkg.exports;
  assert.ok(exportsMap && typeof exportsMap === 'object', 'package.json must have exports');
  assert.equal(exportsMap['.'], './lib/index.js');
  assert.equal(exportsMap['./policy'], './lib/policy.js');
  assert.equal(exportsMap['./client'], './client/client.js');
  assert.equal(exportsMap['./cordis.patch.yml'], './cordis.patch.yml');
  assert.equal(exportsMap['./package.json'], './package.json');
});

test('cordis.patch.yml and dsh.bundle.patch are aligned', () => {
  const pkgPath = path.join(PKG_ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.ok(pkg.dsh?.bundle?.patch, 'dsh.bundle.patch must be defined');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');

  const patchPath = path.join(PKG_ROOT, 'cordis.patch.yml');
  assert.ok(fs.existsSync(patchPath), 'cordis.patch.yml must exist');

  const patchContent = fs.readFileSync(patchPath, 'utf8');
  assert.match(patchContent, /id:\s*['"]?auto-review-model['"]?/);
  assert.match(patchContent, /name:\s*['"]?@local\/dsh-auto-review-model['"]?/);
});

test('dsh.client and peerDependencies are cleaned of deprecated client runtime/slots packages', () => {
  const pkgPath = path.join(PKG_ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.equal(pkg.dsh?.client?.platform, 'web');

  const clientInject: string[] = pkg.dsh?.client?.inject ?? [];
  assert.ok(Array.isArray(clientInject), 'dsh.client.inject must be an array');
  assert.ok(
    !clientInject.includes('@deepseek-ai/dsh-client-runtime'),
    'dsh.client.inject must not include @deepseek-ai/dsh-client-runtime',
  );
  assert.ok(
    !clientInject.includes('@deepseek-ai/dsh-client-ui-slots'),
    'dsh.client.inject must not include @deepseek-ai/dsh-client-ui-slots',
  );

  const peerDeps: Record<string, string> = pkg.peerDependencies ?? {};
  assert.ok(
    !('@deepseek-ai/dsh-client-runtime' in peerDeps),
    'peerDependencies must not include @deepseek-ai/dsh-client-runtime',
  );
  assert.ok(
    !('@deepseek-ai/dsh-client-ui-slots' in peerDeps),
    'peerDependencies must not include @deepseek-ai/dsh-client-ui-slots',
  );
});

test('build artifacts client/client.js and lib/ exist with expected registration', () => {
  const clientPath = path.join(PKG_ROOT, 'client', 'client.js');
  const libIndexPath = path.join(PKG_ROOT, 'lib', 'index.js');
  const libPolicyPath = path.join(PKG_ROOT, 'lib', 'policy.js');

  assert.ok(fs.existsSync(clientPath), 'client/client.js must exist');
  assert.ok(fs.existsSync(libIndexPath), 'lib/index.js must exist');
  assert.ok(fs.existsSync(libPolicyPath), 'lib/policy.js must exist');

  const clientContent = fs.readFileSync(clientPath, 'utf8');
  assert.match(
    clientContent,
    /window\.__ModuleLoader__\.load/,
    'client/client.js must call window.__ModuleLoader__.load',
  );
  assert.match(
    clientContent,
    /id:\s*['"]@local\/dsh-auto-review-model['"]/,
    'client/client.js entry id must be @local/dsh-auto-review-model',
  );
});
