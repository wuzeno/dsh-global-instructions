import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GlobalInstructionsStore } from '../file-store.js';

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-global-store-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'nested', 'home');
  const store = new GlobalInstructionsStore({ home, ...options });
  return { root, home, store, target: path.join(home, 'AGENTS.md') };
}
const rejectsCode = (promise, code) => assert.rejects(promise, (error) => {
  assert.equal(error.code, code);
  assert.equal(typeof error.message, 'string');
  return true;
});

test('absent read does not create home or file; empty presence has a distinct hash', async (t) => {
  const { home, store, target } = await fixture(t);
  const result = await store.read();
  assert.deepEqual(result, { path: target, exists: false, content: '', version: result.version,
    bytes: 0, maxBytes: 65536 });
  assert.match(result.version, /^[a-f0-9]{64}$/);
  await assert.rejects(fs.lstat(home), { code: 'ENOENT' });
  assert.deepEqual(await store.read(), result);
  const saved = await store.save({ content: '', version: result.version });
  assert.equal(saved.exists, true);
  assert.notEqual(saved.version, result.version);
});

test('create/update returns complete snapshots and preserves existing permissions', async (t) => {
  const { store, target } = await fixture(t);
  const first = await store.save({ content: '全局\n', version: (await store.read()).version });
  assert.equal(first.bytes, Buffer.byteLength('全局\n'));
  assert.deepEqual(await store.read(), first);
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
    await fs.chmod(target, 0o640);
  }
  const second = await store.save({ content: '\uFEFFnew\r\n', version: first.version });
  assert.deepEqual(await store.read(), second);
  assert.equal(await fs.readFile(target, 'utf8'), '\uFEFFnew\r\n');
  if (process.platform !== 'win32') assert.equal((await fs.stat(target)).mode & 0o777, 0o640);
});

test('stale, external-create, external-update and external-delete conflicts are not overwritten', async (t) => {
  const { home, store, target } = await fixture(t);
  const absent = await store.read();
  await fs.mkdir(home, { recursive: true });
  await fs.writeFile(target, 'external');
  await rejectsCode(store.save({ content: 'ours', version: absent.version }), 'CONFLICT');
  const first = await store.read();
  await fs.writeFile(target, 'changed');
  await rejectsCode(store.save({ content: 'ours', version: first.version }), 'CONFLICT');
  assert.equal(await fs.readFile(target, 'utf8'), 'changed');
  const second = await store.read();
  await fs.unlink(target);
  await rejectsCode(store.save({ content: 'ours', version: second.version }), 'CONFLICT');
  await assert.rejects(fs.stat(target), { code: 'ENOENT' });
});

test('limits use UTF-8 bytes and oversized reads/saves never truncate', async (t) => {
  const { store, target } = await fixture(t, { maxBytes: 6 });
  const initial = await store.read();
  const exact = await store.save({ content: '中文', version: initial.version });
  assert.equal(exact.bytes, 6);
  await rejectsCode(store.save({ content: '中文a', version: exact.version }), 'TOO_LARGE');
  assert.equal(await fs.readFile(target, 'utf8'), '中文');
  await fs.writeFile(target, '1234567');
  await rejectsCode(store.read(), 'TOO_LARGE');
  assert.equal(await fs.readFile(target, 'utf8'), '1234567');
});

test('invalid UTF-8 and unpaired UTF-16 are rejected without exposing content', async (t) => {
  const { home, store, target } = await fixture(t);
  await fs.mkdir(home, { recursive: true });
  const bad = Buffer.from([0x73, 0x65, 0x63, 0x72, 0x65, 0x74, 0xc3, 0x28]);
  await fs.writeFile(target, bad);
  await assert.rejects(store.read(), (error) => {
    assert.equal(error.code, 'INVALID_UTF8');
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
  await rejectsCode(store.save({ content: 'overwrite', version: 'not-a-version' }), 'INVALID_UTF8');
  assert.deepEqual(await fs.readFile(target), bad);
  await fs.unlink(target);
  await rejectsCode(store.save({ content: '\ud800', version: (await store.read()).version }), 'INVALID_UTF8');
});

test('directories and non-directory home ancestors are unsafe', async (t) => {
  const { home, store, target, root } = await fixture(t);
  await fs.mkdir(target, { recursive: true });
  await rejectsCode(store.read(), 'UNSAFE_PATH');
  await rejectsCode(store.save({ content: 'x', version: 'v' }), 'UNSAFE_PATH');
  const blocked = path.join(root, 'blocked');
  await fs.writeFile(blocked, 'file');
  const other = new GlobalInstructionsStore({ home: path.join(blocked, 'home') });
  await rejectsCode(other.read(), 'UNSAFE_PATH');
  assert.equal(await fs.readFile(blocked, 'utf8'), 'file');
  assert.equal((await fs.stat(home)).isDirectory(), true);
});

test('file symlink is rejected without modifying its destination', async (t) => {
  const { root, home, store, target } = await fixture(t);
  await fs.mkdir(home, { recursive: true });
  const outside = path.join(root, 'outside');
  await fs.writeFile(outside, 'untouched');
  try {
    await fs.symlink(outside, target, 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Windows file symlink privilege unavailable');
      return;
    }
    throw error;
  }
  await rejectsCode(store.read(), 'UNSAFE_PATH');
  await rejectsCode(store.save({ content: 'x', version: 'v' }), 'UNSAFE_PATH');
  assert.equal(await fs.readFile(outside, 'utf8'), 'untouched');
});

test('ancestor symlink/junction is rejected, including when final home is missing', async (t) => {
  const { root } = await fixture(t);
  const outside = path.join(root, 'outside');
  const link = path.join(root, 'link');
  await fs.mkdir(outside);
  await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    const store = new GlobalInstructionsStore({ home: path.join(link, 'missing') });
    await rejectsCode(store.read(), 'UNSAFE_PATH');
    await rejectsCode(store.save({ content: 'x', version: 'v' }), 'UNSAFE_PATH');
    assert.deepEqual(await fs.readdir(outside), []);
  } finally {
    // Explicit removal avoids Windows recursive-rm junction traversal quirks.
    if (process.platform === 'win32') await fs.rmdir(link);
    else await fs.unlink(link);
  }
});

test('hard-linked targets are rejected', async (t) => {
  const { root, home, store, target } = await fixture(t);
  await fs.mkdir(home, { recursive: true });
  const original = path.join(root, 'original');
  await fs.writeFile(original, 'original');
  await fs.link(original, target);
  await rejectsCode(store.read(), 'UNSAFE_PATH');
  assert.equal(await fs.readFile(original, 'utf8'), 'original');
});

test('concurrent saves across store instances permit exactly one writer per version', async (t) => {
  const { home, store } = await fixture(t);
  const initial = await store.read();
  const outcomes = await Promise.allSettled(Array.from({ length: 12 }, (_, i) =>
    new GlobalInstructionsStore({ home }).save({ content: `writer-${i}`, version: initial.version })));
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  for (const result of outcomes.filter((result) => result.status === 'rejected')) {
    assert.equal(result.reason.code, 'CONFLICT');
  }
  const current = await store.read();
  await store.save({ content: 'queue still works', version: current.version });
  assert.deepEqual(await fs.readdir(home), ['AGENTS.md']);
});

test('a late external conflict removes its synced temporary file', async (t) => {
  const { home, store, target, root } = await fixture(t);
  const first = await store.save({ content: 'original', version: (await store.read()).version });
  // Patch only FileHandle.sync: deterministically simulate a third-party edit
  // after temp creation but before the second CAS check, without production hooks.
  const probe = await fs.open(path.join(root, 'probe'), 'w');
  const prototype = Object.getPrototypeOf(probe);
  const realSync = prototype.sync;
  await probe.close();
  t.mock.method(prototype, 'sync', async function () {
    await realSync.call(this);
    await fs.writeFile(target, 'external edit');
  });
  await rejectsCode(store.save({ content: 'ours', version: first.version }), 'CONFLICT');
  assert.equal(await fs.readFile(target, 'utf8'), 'external edit');
  assert.deepEqual(await fs.readdir(home), ['AGENTS.md']);
});

test('invalid API arguments fail with stable codes; zero-byte limit permits only empty text', async (t) => {
  assert.throws(() => new GlobalInstructionsStore({ home: '' }), { code: 'INVALID_ARGUMENT' });
  assert.throws(() => new GlobalInstructionsStore({ home: '.', maxBytes: -1 }), { code: 'INVALID_ARGUMENT' });
  const { store } = await fixture(t, { maxBytes: 0 });
  assert.throws(() => new GlobalInstructionsStore(null), { code: 'INVALID_ARGUMENT' });
  await rejectsCode(store.save(), 'INVALID_ARGUMENT');
  await rejectsCode(store.save(null), 'INVALID_ARGUMENT');
  const initial = await store.read();
  await rejectsCode(store.save({ content: 'x', version: initial.version }), 'TOO_LARGE');
  assert.equal((await store.save({ content: '', version: initial.version })).bytes, 0);
});
