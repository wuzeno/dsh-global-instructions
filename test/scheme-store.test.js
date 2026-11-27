import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { GlobalInstructionsStore, instructionFileVersion } from '../file-store.js';
import { InstructionSchemesStore } from '../scheme-store.js';

const apply = (store, { revision, fileVersion }, action) => store.mutate({ revision, fileVersion, action });
const reject = (promise, code) => assert.rejects(promise, { code });
const readText = (file) => fs.readFile(file, 'utf8');

async function fixture(t, existing) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'dsh-instruction-schemes-'));
  t.after(() => fs.rm(root, { force: true, recursive: true }));
  const home = path.join(root, 'home');
  const projection = path.join(home, 'AGENTS.md');
  if (existing !== undefined) {
    await fs.mkdir(home);
    await fs.writeFile(projection, existing);
  }
  return { root, home, projection, sidecar: path.join(home, '.global-instructions-schemes.json'),
    store: new InstructionSchemesStore({ home }) };
}

test('initial read is deterministic, virtual, verbatim and presence-sensitive', async (t) => {
  const { home, projection, sidecar, store } = await fixture(t);
  const empty = await store.read();
  assert.deepEqual(empty, { revision: empty.revision, fileVersion: empty.fileVersion, path: projection,
    exists: false, maxBytes: 65536, schemes: [{ id: 'default', name: '默认方案', content: '' }],
    selectedId: 'default', enabled: false, externalChanged: false });
  for (const value of [empty.revision, empty.fileVersion]) assert.match(value, /^[a-f0-9]{64}$/);
  assert.deepEqual(empty, await new InstructionSchemesStore({ home }).read());
  await assert.rejects(fs.stat(home), { code: 'ENOENT' });
  await fs.mkdir(home);
  await fs.writeFile(projection, '');
  const present = await store.read();
  assert.notEqual(present.revision, empty.revision);
  assert.notEqual(present.fileVersion, empty.fileVersion);
  assert.equal(present.enabled, true);
  const original = '\uFEFF保留\r\n\0\n';
  await fs.writeFile(projection, original);
  assert.equal((await store.read()).schemes[0].content, original);
  await assert.rejects(fs.stat(sidecar), { code: 'ENOENT' });
  await reject(apply(store, empty, { type: 'create', name: 'stale' }), 'CONFLICT');
});

test('inactive edits stay private; enabled projection is exact; pause preserves the zero-byte file', async (t) => {
  const { home, projection, store } = await fixture(t);
  let state = await store.read();
  state = await apply(store, state, { type: 'create', name: '  Work  ' });
  const work = state.schemes[1];
  assert.deepEqual(work, { id: work.id, name: 'Work', content: '' });
  assert.equal(state.selectedId, 'default');
  assert.equal(state.exists, false);
  assert.equal(state.enabled, false);
  assert.deepEqual(await fs.readdir(home), ['.global-instructions-schemes.json']);
  const content = '\uFEFFline\r\n\n  ';
  state = await apply(store, state, { type: 'save', id: work.id, content });
  state = await apply(store, state, { type: 'select', id: work.id });
  assert.equal(state.exists, false);
  state = await apply(store, state, { type: 'setEnabled', enabled: true });
  assert.equal(await readText(projection), content);
  const version = state.fileVersion;
  const entry = await fs.stat(projection);
  state = await apply(store, state, { type: 'save', id: 'default', content: 'private' });
  state = await apply(store, state, { type: 'rename', id: work.id, name: 'work' });
  assert.equal(state.fileVersion, version);
  assert.equal((await fs.stat(projection)).ino, entry.ino);
  assert.equal(await readText(projection), content);
  state = await apply(store, state, { type: 'save', id: work.id, content: 'new active\r\n' });
  assert.equal(await readText(projection), 'new active\r\n');
  state = await apply(store, state, { type: 'select', id: 'default' });
  assert.equal(await readText(projection), 'private');
  state = await apply(store, state, { type: 'setEnabled', enabled: false });
  assert.equal(state.exists, true);
  assert.equal(await readText(projection), '');
  const empty = await fs.stat(projection);
  state = await apply(store, state, { type: 'setEnabled', enabled: false });
  state = await apply(store, state, { type: 'select', id: work.id });
  assert.equal((await fs.stat(projection)).ino, empty.ino);
  assert.equal(await readText(projection), '');
  state = await apply(store, state, { type: 'setEnabled', enabled: true });
  assert.equal(await readText(projection), 'new active\r\n');
  state = await apply(store, state, { type: 'delete', id: 'default' });
  assert.deepEqual(state, await store.read());
  assert.deepEqual(state.schemes.map(({ name }) => name), ['work']);
});

test('strict action fields, trimmed code-point length, name uniqueness and byte bounds', async (t) => {
  const { store } = await fixture(t);
  let state = await store.read();
  for (const action of [{ type: 'create', name: 'x', content: 'no' }, { type: 'create' },
    { type: 'select', id: 'default', path: 'AGENTS.md' }, { type: 'adoptExternal', force: true },
    { type: 'setEnabled', enabled: 1 }, { type: 'rename', id: 'default', name: ' ' },
    { type: 'save', id: 'default', content: 1 }, { type: 'rename', id: randomUUID(), name: 'x' },
    { type: 'delete', id: 'default' }, { type: 'create', name: '🙂'.repeat(61) }]) {
    await reject(apply(store, state, action), 'INVALID_ARGUMENT');
  }
  await reject(store.mutate({ ...state, action: { type: 'create', name: 'x' } }), 'INVALID_ARGUMENT');
  await reject(apply(store, state, { type: 'save', id: 'default', content: '\ud800' }), 'INVALID_UTF8');
  await reject(apply(store, state, { type: 'save', id: 'default', content: '🙂'.repeat(16385) }), 'TOO_LARGE');
  state = await apply(store, state, { type: 'create', name: '🙂'.repeat(60) });
  state = await apply(store, state, { type: 'create', name: 'Mixed' });
  await reject(apply(store, state, { type: 'create', name: ' mixed ' }), 'INVALID_ARGUMENT');
  await reject(apply(store, state, { type: 'rename', id: 'default', name: 'MIXED' }), 'INVALID_ARGUMENT');
  await reject(apply(store, state, { type: 'delete', id: 'default' }), 'INVALID_ARGUMENT');
  const limit = '🙂'.repeat(16384);
  state = await apply(store, state, { type: 'save', id: 'default', content: limit });
  assert.equal(state.schemes[0].content, limit);
  assert.equal(state.exists, false);
});

test('external change requires fresh CAS adoption without rewriting existing bytes', async (t) => {
  const { projection, store } = await fixture(t, 'previous');
  const old = await apply(store, await store.read(), { type: 'create', name: '外部导入' });
  await fs.writeFile(projection, '');
  const external = await store.read();
  assert.equal(external.revision, old.revision);
  assert.notEqual(external.fileVersion, old.fileVersion);
  assert.equal(external.exists, true);
  assert.equal(external.externalChanged, true);
  assert.equal(external.schemes[0].content, 'previous');
  await reject(apply(store, old, { type: 'adoptExternal' }), 'CONFLICT');
  await reject(apply(store, external, { type: 'setEnabled', enabled: false }), 'CONFLICT');
  const oldStat = await fs.stat(projection);
  const adopted = await apply(store, external, { type: 'adoptExternal' });
  assert.equal(adopted.enabled, true);
  assert.equal(adopted.externalChanged, false);
  assert.deepEqual(adopted.schemes[2], { id: adopted.selectedId, name: '外部导入 2', content: '' });
  assert.equal((await fs.stat(projection)).ino, oldStat.ino);
  await fs.unlink(projection);
  const missing = await store.read();
  assert.equal(missing.externalChanged, true);
  assert.notEqual(missing.fileVersion, adopted.fileVersion);
  const paused = await apply(store, missing, { type: 'adoptExternal' });
  assert.equal(paused.exists, false);
  assert.equal(paused.enabled, false);
  assert.equal(paused.externalChanged, false);
  assert.deepEqual(paused.schemes, adopted.schemes);
  assert.equal(paused.selectedId, adopted.selectedId);
  await assert.rejects(fs.stat(projection), { code: 'ENOENT' });
  await reject(apply(store, paused, { type: 'adoptExternal' }), 'INVALID_ARGUMENT');
});

test('adoption at capacity permits only a non-selected deletion to make space', async (t) => {
  const { projection, store } = await fixture(t, 'original');
  let state = await store.read();
  for (let i = 1; i < 16; i++) state = await apply(store, state, { type: 'create', name: `Scheme ${i}` });
  await reject(apply(store, state, { type: 'create', name: 'Overflow' }), 'SCHEME_LIMIT');
  await fs.writeFile(projection, 'external');
  state = await store.read();
  await reject(apply(store, state, { type: 'adoptExternal' }), 'SCHEME_LIMIT');
  await reject(apply(store, state, { type: 'delete', id: state.selectedId }), 'INVALID_ARGUMENT');
  await reject(apply(store, state, { type: 'rename', id: state.schemes[1].id, name: 'No' }), 'CONFLICT');
  state = await apply(store, state, { type: 'delete', id: state.schemes[1].id });
  assert.equal(state.schemes.length, 15);
  assert.equal(state.externalChanged, true);
  assert.equal((await store.read()).externalChanged, true);
  await reject(apply(store, state, { type: 'delete', id: state.schemes[1].id }), 'CONFLICT');
  const adopted = await apply(store, state, { type: 'adoptExternal' });
  assert.equal(adopted.schemes.length, 16);
  assert.equal(adopted.schemes[15].content, 'external');
  assert.equal(adopted.externalChanged, false);
  assert.equal(await readText(projection), 'external');
});

test('mutations and reads serialize across scheme and legacy store instances', async (t) => {
  const { home, store, projection } = await fixture(t, 'start');
  const initial = await store.read();
  const legacy = new GlobalInstructionsStore({ home });
  const one = apply(store, initial, { type: 'save', id: 'default', content: 'winner' });
  const concurrentRead = new InstructionSchemesStore({ home }).read();
  const two = apply(new InstructionSchemesStore({ home }), initial, { type: 'create', name: 'loser' });
  const oldRoute = legacy.save({ version: initial.fileVersion, content: 'old route' });
  const settled = await Promise.allSettled([one, concurrentRead, two, oldRoute]);
  assert.equal(settled[0].status, 'fulfilled');
  assert.deepEqual(settled[1], settled[0]);
  for (const outcome of settled.slice(2)) {
    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.reason.code, 'CONFLICT');
  }
  assert.equal(await readText(projection), 'winner');
});

async function interceptSync(t, root, callback) {
  const handle = await fs.open(path.join(root, 'probe'), 'w');
  const prototype = Object.getPrototypeOf(handle);
  const original = prototype.sync;
  await handle.close();
  let count = 0;
  t.mock.method(prototype, 'sync', async function () {
    await original.call(this);
    await callback(++count);
  });
}

for (const stop of [1, 2, 3]) {
  test(`failed sync ${stop} leaves a safely readable before/after transaction`, async (t) => {
    const { root, home, projection, sidecar, store } = await fixture(t, 'before');
    const initial = await store.read();
    await interceptSync(t, root, (count) => { if (count === stop) throw new Error('simulated sync failure'); });
    await reject(apply(store, initial, { type: 'save', id: 'default', content: 'after' }), 'IO_ERROR');
    const raw = stop === 1 ? null : await readText(sidecar);
    if (stop === 1) await assert.rejects(fs.stat(sidecar), { code: 'ENOENT' });
    const reopened = new InstructionSchemesStore({ home });
    const recovered = await reopened.read();
    const expected = stop === 3 ? 'after' : 'before';
    assert.equal(await readText(projection), expected);
    assert.equal(recovered.externalChanged, false);
    assert.equal(recovered.schemes[0].content, expected);
    if (stop !== 1) {
      const journal = JSON.parse(raw);
      assert.equal(journal.committed.schemes[0].content, 'before');
      assert.equal(journal.next.schemes[0].content, 'after');
      assert.equal(await readText(sidecar), raw, 'GET must not rewrite the journal');
    }
    if (stop === 3) await reject(apply(reopened, initial, { type: 'create', name: 'stale' }), 'CONFLICT');
    const done = await apply(reopened, recovered, { type: 'create', name: 'continued' });
    assert.equal(done.schemes[0].content, expected);
    assert.equal(done.schemes[1].name, 'continued');
    assert.deepEqual((await fs.readdir(home)).sort(), ['.global-instructions-schemes.json', 'AGENTS.md']);
  });
}

for (const editedAt of [2, 3]) {
  test(`external change at transaction sync ${editedAt} preserves both sides of the journal`, async (t) => {
    const { root, home, projection, sidecar, store } = await fixture(t, 'before');
    const initial = await store.read();
    await interceptSync(t, root, async (n) => { if (n === editedAt) await fs.writeFile(projection, 'external'); });
    await reject(apply(store, initial, { type: 'save', id: 'default', content: 'pending' }), 'CONFLICT');
    const raw = await readText(sidecar);
    const { from, to, committed, next } = JSON.parse(raw);
    assert.equal(from, initial.fileVersion);
    assert.equal(to, instructionFileVersion(true, Buffer.from('pending')));
    assert.equal(committed.schemes[0].content, 'before');
    assert.equal(next.schemes[0].content, 'pending');
    const reopened = new InstructionSchemesStore({ home });
    await reject(reopened.read(), 'INVALID_STATE');
    await reject(apply(reopened, initial, { type: 'adoptExternal' }), 'INVALID_STATE');
    assert.equal(await readText(sidecar), raw);
    assert.equal(await readText(projection), 'external');
    // Operator backs up the external text and restores one exact endpoint.
    const endpoint = editedAt === 2 ? 'before' : 'pending';
    await fs.writeFile(projection, endpoint);
    assert.equal((await reopened.read()).schemes[0].content, endpoint);
  });
}

test('adoption rechecks the external version just before metadata replacement', async (t) => {
  const { root, projection, sidecar, store } = await fixture(t, 'before');
  await apply(store, await store.read(), { type: 'create', name: 'private' });
  const raw = await readText(sidecar);
  await fs.writeFile(projection, 'external first');
  const old = await store.read();
  await interceptSync(t, root, async () => fs.writeFile(projection, 'external second'));
  await reject(apply(store, old, { type: 'adoptExternal' }), 'CONFLICT');
  assert.equal(await readText(sidecar), raw);
  assert.equal(await readText(projection), 'external second');
});

test('journal is bounded yet fits two worst-case content sets', async (t) => {
  const { root, projection, sidecar, store } = await fixture(t, '');
  const escaped = '\0'.repeat(65536);
  const schemes = Array.from({ length: 16 }, (_, i) => ({ id: i === 0 ? 'default' : randomUUID(),
    name: `scheme ${i}`, content: escaped }));
  const base = {
    revision: '1'.repeat(64), fileVersion: instructionFileVersion(true, Buffer.alloc(0)),
    schemes, selectedId: 'default', enabled: false,
  };
  await fs.writeFile(sidecar, JSON.stringify({ schema: 1, state: base }));
  const current = await store.read();
  await interceptSync(t, root, (count) => { if (count === 2) throw new Error('retain journal'); });
  await reject(apply(store, current, { type: 'setEnabled', enabled: true }), 'IO_ERROR');
  assert.ok((await fs.stat(sidecar)).size > 12 * 1024 * 1024);
  assert.equal((await store.read()).schemes[0].content, escaped);
  assert.equal(await readText(projection), '');
  await fs.truncate(sidecar, 14 * 1024 * 1024);
  await reject(store.read(), 'TOO_LARGE');
});

test('sidecar uses the same safe file rules and malformed metadata fails closed', async (t) => {
  const { root, projection, sidecar, store } = await fixture(t, 'untouched');
  const now = await store.read();
  await fs.writeFile(sidecar, '{garbled');
  await reject(store.read(), 'INVALID_STATE');
  await reject(apply(store, now, { type: 'adoptExternal' }), 'INVALID_STATE');
  assert.equal(await readText(sidecar), '{garbled');
  await fs.writeFile(sidecar, Buffer.from([0xff]));
  await reject(store.read(), 'INVALID_UTF8');
  await fs.unlink(sidecar);
  const candidate = path.join(root, 'outside');
  await fs.writeFile(candidate, 'outside');
  await fs.link(candidate, sidecar);
  await reject(store.read(), 'UNSAFE_PATH');
  await reject(apply(store, now, { type: 'create', name: 'Safe' }), 'UNSAFE_PATH');
  assert.equal(await readText(candidate), 'outside');
  assert.equal(await readText(projection), 'untouched');
});
