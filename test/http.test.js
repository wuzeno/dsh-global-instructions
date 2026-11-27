import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGlobalInstructionsHandler, ROUTE, MAX_REQUEST_BYTES } from '../index.js';
import { InstructionSchemesStore } from '../scheme-store.js';

const envelope = ({ revision, fileVersion }, action) => JSON.stringify({ revision, fileVersion, action });

async function fixture(t, custom = {}) {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-instructions-http-'));
  const home = join(temporary, 'isolated-home');
  const store = custom.store || new InstructionSchemesStore({ home });
  const admissions = [];
  const connection = { admit(input) {
    admissions.push(input);
    if (input.headers.authorization === 'denied') return { rejection: 401 };
    if (input.headers.authorization === 'forbidden') return { rejection: 403 };
    return { peer: { principal: { kind: input.headers.authorization === 'guest' ? 'guest' : 'owner' } } };
  } };
  const server = createServer(createGlobalInstructionsHandler({ connection, store }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  });
  async function call({ method = 'GET', path = ROUTE, headers = {}, body, chunks } = {}) {
    return new Promise((resolve, reject) => {
      const req = request(origin + path, { method, headers, agent: false }, res => {
        const data = [];
        res.on('data', chunk => data.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(data).toString('utf8');
          resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null });
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      if (chunks) for (const chunk of chunks) req.write(chunk);
      req.end(body);
    });
  }
  const post = (body, headers = {}) => call({ method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body });
  return { call, post, origin, home, store, admissions };
}

test('owner GET and POST round trip only the isolated home; GET is non-creating', async t => {
  const f = await fixture(t);
  const first = await f.call();
  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.equal(first.body.value.exists, false);
  await assert.rejects(stat(f.home), { code: 'ENOENT' });
  assert.equal(first.headers['cache-control'], 'no-store');
  assert.equal(first.headers['x-content-type-options'], 'nosniff');
  const { selectedId } = first.body.value;
  const saved = await f.post(envelope(first.body.value, { type: 'save', id: selectedId, content: '# 中文\r\n' }));
  assert.equal(saved.status, 200);
  await assert.rejects(stat(join(f.home, 'AGENTS.md')), { code: 'ENOENT' });
  const enabled = await f.post(envelope(saved.body.value, { type: 'setEnabled', enabled: true }));
  assert.equal(enabled.status, 200);
  assert.equal(await readFile(join(f.home, 'AGENTS.md'), 'utf8'), '# 中文\r\n');
  assert.equal((await f.call()).body.value.schemes[0].content, '# 中文\r\n');
  assert.equal(f.admissions.length, 4);
  assert.ok(f.admissions.every(item => Object.keys(item).join() === 'headers'));
});

test('owner can prepare a second scheme without applying it, then switch, pause and resume', async t => {
  const f = await fixture(t);
  const target = join(f.home, 'AGENTS.md');
  let state = (await f.call()).body.value;
  const change = async (action) => {
    const result = await f.post(envelope(state, action));
    assert.equal(result.status, 200, JSON.stringify(result.body.error));
    state = result.body.value;
  };
  const original = state.selectedId;
  await change({ type: 'save', id: original, content: 'first' });
  await change({ type: 'setEnabled', enabled: true });
  await change({ type: 'create', name: 'Second scheme' });
  const second = state.schemes.find(scheme => scheme.id !== original).id;
  await change({ type: 'save', id: second, content: 'second' });
  assert.equal(state.selectedId, original);
  assert.equal(await readFile(target, 'utf8'), 'first');
  await change({ type: 'select', id: second });
  assert.equal(await readFile(target, 'utf8'), 'second');
  await change({ type: 'setEnabled', enabled: false });
  assert.equal(state.selectedId, second);
  assert.equal(await readFile(target, 'utf8'), '');
  await change({ type: 'setEnabled', enabled: true });
  assert.equal(await readFile(target, 'utf8'), 'second');
});

test('rejects admission failures and non-owner reads/writes before store access', async t => {
  const store = { read() { throw new Error('must not read'); }, mutate() { throw new Error('must not mutate'); } };
  const f = await fixture(t, { store });
  for (const [authorization, status] of [['denied', 401], ['forbidden', 403], ['guest', 403]]) {
    for (const method of ['GET', 'POST']) {
      const response = await f.call({ method, headers: { authorization } });
      assert.equal(response.status, status);
      assert.equal(response.body.ok, false);
    }
  }
});

test('desktop relay can create and save without Origin; explicit cross-site and preflight remain denied', async t => {
  const f = await fixture(t);
  const headers = { 'content-type': 'application/json', 'x-dsh-instructions-write': '1' };
  const first = (await f.call()).body.value;
  const create = envelope(first, { type: 'create', name: 'Desktop' });
  for (const extra of [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }]) {
    const denied = await f.call({ method: 'POST', headers: { ...headers, ...extra }, body: create });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'ORIGIN_REQUIRED');
  }
  const preflight = await f.call({ method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-dsh-instructions-write' } });
  assert.equal(preflight.status, 405);
  assert.equal(preflight.headers['access-control-allow-origin'], undefined);
  const created = await f.call({ method: 'POST', headers, body: create });
  assert.equal(created.status, 200);
  const id = created.body.value.schemes.find(scheme => scheme.name === 'Desktop').id;
  const saved = await f.call({ method: 'POST', headers, body: envelope(created.body.value, { type: 'save', id, content: '# Desktop' }) });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.value.schemes.find(scheme => scheme.id === id).content, '# Desktop');
});

test('POST rejects missing or mismatched Origin without a valid desktop guard', async t => {
  const f = await fixture(t);
  for (const origin of [undefined, 'null', 'https://evil.example', f.origin + '/', f.origin + '/path', f.origin.replace('http:', 'https:')]) {
    const headers = { 'content-type': 'application/json', 'x-forwarded-proto': 'https' };
    if (origin !== undefined) headers.origin = origin;
    const response = await f.call({ method: 'POST', headers, body: '{}' });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'ORIGIN_REQUIRED');
  }
});

test('rejects non-JSON, malformed charset, and compressed payloads', async t => {
  const f = await fixture(t);
  for (const type of ['text/plain', 'application/jsonp', 'application/json; charset=latin1', 'application/json; boundary=x']) {
    assert.equal((await f.post('{}', { 'content-type': type })).status, 415);
  }
  assert.equal((await f.post('{}', { 'content-encoding': 'gzip' })).status, 415);
  assert.equal((await f.call({ method: 'POST', headers: { origin: f.origin }, body: '{}' })).status, 415);
});

test('validates JSON schema without accepting a path or arbitrary fields', async t => {
  const f = await fixture(t);
  for (const payload of ['{', 'null', '[]', '"text"', '{}', '{"content":true,"version":"x"}',
    JSON.stringify({ revision: 'a'.repeat(64), fileVersion: 'b'.repeat(64), action: { type: 'create', name: 'one' }, path: 'other.md' }),
    envelope({ revision: 'a'.repeat(64), fileVersion: 'b'.repeat(64) }, [])]) {
    assert.equal((await f.post(payload)).status, 400);
  }
  const response = await f.post(Buffer.from([0xff]));
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'INVALID_UTF8');
  await assert.rejects(stat(f.home), { code: 'ENOENT' });
});

test('allows UTF-8 charset and JSON escapes near the document limit', async t => {
  const f = await fixture(t);
  const first = await f.call();
  const content = '\u0000'.repeat(65536);
  const payload = envelope(first.body.value, { type: 'save', id: first.body.value.selectedId, content });
  assert.ok(Buffer.byteLength(payload) < MAX_REQUEST_BYTES);
  const result = await f.post(payload, { 'content-type': 'application/json; charset="UTF-8"' });
  assert.equal(result.status, 200);
  assert.equal(Buffer.byteLength(result.body.value.schemes[0].content), 65536);
});

test('bounded body rejects explicit length and chunked overflow with JSON 413', async t => {
  const f = await fixture(t);
  const explicit = await f.post('x', { 'content-length': String(MAX_REQUEST_BYTES + 1) });
  assert.equal(explicit.status, 413);
  assert.equal(explicit.body.error.code, 'TOO_LARGE');
  const chunked = await f.call({ method: 'POST', headers: { origin: f.origin, 'content-type': 'application/json' },
    chunks: [Buffer.alloc(MAX_REQUEST_BYTES, 32), Buffer.alloc(1, 32)] });
  assert.equal(chunked.status, 413);
  assert.equal(chunked.body.error.code, 'TOO_LARGE');
});

test('store conflict and document limit retain their structured HTTP status', async t => {
  const f = await fixture(t);
  const first = (await f.call()).body.value;
  const save = (snapshot, content) => f.post(envelope(snapshot, { type: 'save', id: snapshot.selectedId, content }));
  assert.equal((await save(first, 'one')).status, 200);
  const conflict = await save(first, 'two');
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'CONFLICT');
  const current = (await f.call()).body.value;
  const large = await save(current, 'a'.repeat(65537));
  assert.equal(large.status, 413);
  assert.equal((await f.call()).body.value.schemes[0].content, 'one');
});

test('sanitizes store errors and maps safe-path failures without leaking internals', async t => {
  for (const [code, status] of [['UNSAFE_PATH', 409], ['INVALID_UTF8', 400], ['IO_ERROR', 500], ['EACCES', 500]]) {
    const f = await fixture(t, { store: { async read() { throw Object.assign(new Error('SECRET C:\\private token'), { code }); } } });
    const response = await f.call();
    assert.equal(response.status, status);
    assert.ok(!JSON.stringify(response).includes('SECRET'));
  }
});

test('only exact pathname GET/POST are served', async t => {
  const f = await fixture(t);
  assert.equal((await f.call({ path: ROUTE + '/child' })).status, 404);
  assert.equal((await f.call({ path: '/api/plugins/global-instructions' })).status, 404);
  assert.equal((await f.call({ path: '/api/plugins/elsewhere' })).status, 404);
  const response = await f.call({ method: 'DELETE' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, 'GET, POST');
});
