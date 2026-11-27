import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const scheme = (id, name, content) => ({ id, name, content });
const alpha = scheme('a', 'Alpha', 'baseline');
const beta = scheme('b', 'Beta', 'other');
const snapshot = (overrides = {}) => ({ revision: 'r1', fileVersion: 'v1', path: '/isolated-test/AGENTS.md',
  exists: true, maxBytes: 65536, schemes: [alpha, beta], selectedId: 'a', enabled: true, externalChanged: false, ...overrides });
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return value; } });
const ok = (value) => response({ ok: true, value });
const err = (code, status = 409) => response({ ok: false, error: { code, message: 'SECRET server detail' } }, status);
const malformed = (status) => ({ ok: status === 200, status, async json() { throw new Error('SECRET body'); } });
const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : [tree, ...tree.children.flatMap(nodes)];
const text = (node) => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : node.children.map(text).join('');
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function abortableFetch({ signal }) {
  return new Promise((_, reject) => signal.addEventListener('abort', () => {
    reject(Object.assign(new Error('SECRET transport detail'), { name: 'AbortError', code: 20 }));
  }, { once: true }));
}

// Contract stub: captures host React calls/props and observes lifecycle; not a browser renderer.
function harness(t) {
  const queued = [], requests = [], unexpected = [], effects = [], confirms = [], answers = [], registrations = [];
  const listeners = new Map(), timers = new Map(), requires = [], hookSlots = [];
  let timerId = 0, declaration, inject, localeRegistration, slotCleanup, tree, cursor, pending, mounted = false;
  let dirty = false, afterUnmount = 0, subscriptions = 0, localeDisposals = 0, slotDisposals = 0, localeCode = 'en', localeRev = 0;
  const localeListeners = new Set();
  const React = {
    createElement(type, props, ...children) { return { type, props: props || {}, children }; },
    useEffect(commit, deps) {
      const index = cursor++;
      const previous = hookSlots[index];
      if (previous && deps.length === previous.deps.length && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      pending.push(() => { previous?.cleanup?.(); hookSlots[index] = { deps, cleanup: commit() }; });
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      const value = getSnapshot();
      React.useEffect(() => {
        subscriptions++;
        const dispose = subscribe(() => { if (mounted) dirty = true; else afterUnmount++; });
        return () => { subscriptions--; dispose(); };
      }, [subscribe]);
      React.useEffect(() => { if (!Object.is(value, getSnapshot())) dirty = true; }, [value, getSnapshot]);
      return value;
    }
  };
  const window = {
    __ModuleLoader__: { load(value) { assert.equal(declaration, undefined); declaration = value; } },
    confirm(message) { confirms.push(message); return answers.shift() ?? true; },
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) { assert.equal(listeners.get(name), listener); listeners.delete(name); }
  };
  vm.runInNewContext(source, {
    window, TextEncoder, AbortController,
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, options) {
      requests.push({ url, ...options });
      if (!queued.length) { unexpected.push(options.method); throw new Error('Unexpected request'); }
      const next = queued.shift();
      return typeof next === 'function' ? next(options) : next;
    }
  }, { filename: 'client.js' });
  const plugin = declaration.factory((name) => { requires.push(name); assert.equal(name, 'react'); return React; });
  const locale = {
    register(namespace, dictionaries) { localeRegistration = { namespace, dictionaries }; return () => { localeDisposals++; }; },
    bind(namespace) {
      assert.equal(namespace, 'global-instructions');
      return (key) => { const value = localeRegistration.dictionaries[localeCode][key]; assert.equal(typeof value, 'string', key); return value; };
    },
    subscribe(fn) { localeListeners.add(fn); return () => localeListeners.delete(fn); },
    getSnapshot() { return { revision: localeRev }; }
  };
  plugin.apply({ locale, effect(commit) { effects.push(commit()); }, slots: {
    inject(name, callback) { assert.equal(name, 'settings.section'); inject = callback; },
    register(options, component) { registrations.push({ options, component }); return () => { slotDisposals++; }; }
  } });
  const h = {
    queued, requests, confirms, answers, registrations, requires, timers, listeners, declaration, plugin, localeRegistration,
    get subscriptions() { return subscriptions; }, get afterUnmount() { return afterUnmount; },
    get localeDisposals() { return localeDisposals; }, get slotDisposals() { return slotDisposals; },
    render() {
      if (!mounted) return;
      dirty = false; cursor = 0; pending = [];
      tree = registrations.at(-1).component();
      for (const commit of pending) commit();
    },
    async settle() { for (let i = 0; i < 8; i++) { await tick(); if (dirty) this.render(); } },
    async mount() { mounted = true; slotCleanup = inject(); this.render(); await this.settle(); },
    async open(value = snapshot()) { queued.push(ok(value)); await this.mount(); },
    leave() {
      if (!mounted) return;
      mounted = false;
      for (const slot of hookSlots) slot?.cleanup?.();
      hookSlots.length = 0;
      slotCleanup();
      tree = null;
    },
    async useLocale(code) {
      localeCode = code; localeRev++;
      for (const fn of localeListeners) fn();
      await this.settle();
    },
    dispose() { this.leave(); while (effects.length) effects.pop()?.(); },
    tryUnload() {
      let prevented = false;
      listeners.get('beforeunload')?.({ preventDefault() { prevented = true; } });
      return prevented;
    },
    get text() { return text(tree); },
    all(predicate) { return nodes(tree).filter(predicate); },
    one(predicate) { const found = this.all(predicate); assert.equal(found.length, 1); return found[0]; },
    tag(type) { return this.one((node) => node.type === type); },
    button(label) { return this.one((node) => node.type === 'button' && text(node) === label); },
    toggle() { return this.one((node) => node.props.role === 'switch'); },
    alerts() { return this.all((node) => node.props.role === 'alert').map(text).join(' '); },
    async click(button) {
      const node = typeof button === 'string' ? this.button(button) : button;
      assert.notEqual(node.props.disabled, true);
      node.props.onClick(); this.render(); await this.settle();
    },
    async change(type, value) {
      const node = this.tag(type);
      assert.notEqual(node.props.disabled, true);
      node.props.onChange({ target: { value } }); this.render(); await this.settle();
    },
    async submitName(value) {
      await this.change('input', value);
      this.tag('form').props.onSubmit({ preventDefault() {} }); this.render(); await this.settle();
    },
    assertPost(action, rev = 'r1', file = 'v1') {
      const req = requests.at(-1);
      assert.equal(req.method, 'POST');
      assert.equal(req.headers['Content-Type'], 'application/json');
      assert.equal(req.headers['X-DSH-Instructions-Write'], '1');
      assert.equal(req.credentials, 'same-origin');
      assert.equal(req.cache, 'no-store');
      assert.equal(req.mode, 'same-origin');
      assert.equal(req.redirect, 'error');
      assert.equal(req.url, '/api/plugins/global-instructions/schemes');
      assert.deepEqual(JSON.parse(req.body), { revision: rev, fileVersion: file, action });
    }
  };
  t.after(() => { h.dispose(); assert.deepEqual(unexpected, []); assert.equal(queued.length, 0, 'Unused responses'); });
  return h;
}

test('registers the lazy settings slot, preserves theme/localization and cleans up', async (t) => {
  const h = harness(t);
  assert.equal(h.declaration.id, 'dsh-global-instructions');
  assert.deepEqual(h.requires, ['react']);
  assert.deepEqual(Array.from(h.plugin.inject), ['slots', 'locale']);
  assert.equal(h.registrations.length, 0);
  assert.equal(h.requests.length, 0);
  assert.equal(h.localeRegistration.namespace, 'global-instructions');
  const { zh, en } = h.localeRegistration.dictionaries;
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  await h.open();
  const { options } = h.registrations[0];
  assert.equal(options.name, 'settings.section');
  assert.equal(options.id, 'global-instructions-editor');
  assert.equal(options.order, 510);
  assert.equal(options.label(), 'Global instructions');
  assert.equal(h.tag('section').props['aria-labelledby'], h.tag('h2').props.id);
  assert.equal(text(h.tag('h2')), 'Global instructions');
  assert.doesNotMatch(text(h.tag('style')), /(?:^|[;{])color:\s*var\(--dsw-alias-bg-/m);
  const label = h.one((node) => node.props.id === h.toggle().props['aria-labelledby']);
  assert.equal(text(label), 'Enable scheme');
  assert.match(h.text, /Applied scheme: Alpha/);
  assert.match(h.text, /After saving, new sessions use the updated instructions/);
  await h.useLocale('zh');
  assert.equal(options.label(), '全局指令');
  assert.equal(text(h.tag('h2')), '全局指令');
  assert.match(h.text, /当前应用: Alpha/);
  assert.equal(h.subscriptions, 2);
  h.dispose();
  assert.equal(h.localeDisposals, 1);
  assert.equal(h.slotDisposals, 1);
  assert.equal(h.subscriptions, 0);
  assert.equal(h.listeners.has('beforeunload'), false);
});

test('GET is owner-route same-origin/no-store; preview is local and save sends both tokens without applying', async (t) => {
  const h = harness(t); await h.open();
  const get = h.requests[0];
  assert.equal(get.method, 'GET');
  assert.equal(get.url, '/api/plugins/global-instructions/schemes');
  assert.equal(get.credentials, 'same-origin');
  assert.equal(get.cache, 'no-store');
  assert.equal(get.body, undefined);
  assert.equal(h.button('Save content').props.disabled, true);
  await h.change('select', 'b');
  assert.equal(h.requests.length, 1);
  assert.equal(h.tag('textarea').props.value, 'other');
  assert.match(h.text, /Applied scheme: Alpha/);
  assert.match(h.text, /Saving does not switch or enable schemes/);
  await h.change('textarea', '中文');
  h.queued.push(ok(snapshot({ revision: 'r2', fileVersion: 'v2', schemes: [alpha, scheme('b', 'Beta', '中文')] })));
  await h.click('Save content');
  h.assertPost({ type: 'save', id: 'b', content: '中文' });
  assert.equal(h.button('Save content').props.disabled, true);
  assert.match(h.text, /Content saved/);
  assert.match(h.text, /Applied scheme: Alpha/);
  h.queued.push(ok(snapshot({ revision: 'r3', selectedId: 'b', schemes: [alpha, scheme('b', 'Beta', '中文')] })));
  await h.click('Apply this scheme');
  h.assertPost({ type: 'select', id: 'b' }, 'r2', 'v2');
  assert.match(h.text, /Applied scheme: Beta/);
  assert.equal(h.confirms.length, 0);
});

test('create previews a new empty scheme without applying; rename preserves unsaved text', async (t) => {
  const h = harness(t); await h.open();
  await h.change('textarea', 'unsaved old draft');
  await h.click('New scheme');
  h.answers.push(false);
  await h.submitName(' Empty ');
  assert.match(h.confirms[0], /discards your unsaved changes/);
  assert.equal(h.requests.length, 1);
  assert.equal(h.tag('textarea').props.value, 'unsaved old draft');
  await h.submitName('中'.repeat(61));
  assert.equal(h.requests.length, 1);
  assert.match(h.alerts(), /1 to 60 characters/);
  h.queued.push(err('INVALID_ARGUMENT', 400));
  await h.submitName(' Empty ');
  h.assertPost({ type: 'create', name: 'Empty' });
  assert.equal(h.tag('input').props.value, ' Empty ');
  assert.equal(h.tag('textarea').props.value, 'unsaved old draft');
  const empty = scheme('c', 'Empty', '');
  h.queued.push(ok(snapshot({ revision: 'r2', schemes: [alpha, beta, empty] })));
  await h.submitName(' Empty ');
  assert.equal(h.tag('select').props.value, 'c');
  assert.equal(h.tag('textarea').props.value, '');
  assert.match(h.text, /Empty scheme created. It is not applied/);
  assert.match(h.text, /Applied scheme: Alpha/);
  await h.change('textarea', 'draft for empty scheme');
  await h.click('Rename');
  assert.equal(h.tag('input').props.value, 'Empty');
  h.queued.push(ok(snapshot({ revision: 'r3', schemes: [alpha, beta, scheme('c', 'Renamed', '')] })));
  await h.submitName('Renamed');
  h.assertPost({ type: 'rename', id: 'c', name: 'Renamed' }, 'r2');
  assert.equal(h.tag('textarea').props.value, 'draft for empty scheme');
  assert.equal(h.tryUnload(), true);
});

test('pause is immediate, remembers the selection, and explicitly selecting while paused does not enable', async (t) => {
  const h = harness(t); await h.open();
  await h.change('select', 'b');
  await h.change('textarea', 'keep the draft');
  h.queued.push(ok(snapshot({ revision: 'r2', enabled: false, exists: false })));
  await h.click(h.toggle());
  h.assertPost({ type: 'setEnabled', enabled: false });
  assert.equal(h.toggle().props['aria-checked'], false);
  assert.match(h.text, /Paused. No scheme is applied./);
  assert.match(h.text, /Scheme for next enable: Alpha/);
  h.queued.push(ok(snapshot({ revision: 'r3', enabled: false, exists: false, selectedId: 'b' })));
  await h.click('Use when enabled');
  h.assertPost({ type: 'select', id: 'b' }, 'r2');
  assert.match(h.text, /Scheme for next enable: Beta/);
  assert.equal(h.button('Delete scheme').props.disabled, true);
  h.queued.push(ok(snapshot({ revision: 'r4', selectedId: 'b' })));
  await h.click(h.toggle());
  h.assertPost({ type: 'setEnabled', enabled: true }, 'r3');
  assert.equal(h.toggle().props['aria-checked'], true);
  assert.match(h.text, /Applied scheme: Beta/);
  assert.equal(h.tag('textarea').props.value, 'keep the draft');
  assert.equal(h.confirms.length, 0);
});

test('dirty preview and deletion prompt; selected and last scheme cannot be deleted', async (t) => {
  const h = harness(t); await h.open();
  assert.equal(h.button('Delete scheme').props.disabled, true);
  h.button('Delete scheme').props.onClick();
  await h.change('textarea', 'do not discard');
  h.answers.push(false);
  await h.change('select', 'b');
  assert.equal(h.tag('select').props.value, 'a');
  assert.equal(h.tag('textarea').props.value, 'do not discard');
  assert.match(h.confirms[0], /Switching the editor discards/);
  await h.change('select', 'b');
  await h.change('textarea', 'unsaved Beta');
  h.answers.push(false);
  await h.click('Delete scheme');
  assert.match(h.confirms[2], /unsaved draft/);
  assert.equal(h.tag('textarea').props.value, 'unsaved Beta');
  assert.equal(h.requests.length, 1);
  h.queued.push(ok(snapshot({ revision: 'r2', schemes: [alpha] })));
  await h.click('Delete scheme');
  h.assertPost({ type: 'delete', id: 'b' });
  assert.equal(h.tag('textarea').props.value, 'baseline');
  assert.equal(h.button('Delete scheme').props.disabled, true);
  assert.match(h.text, /Keep at least one scheme/);
});

test('dirty editor and local preview survive settings navigation without rereading; clean remount refreshes same preview', async (t) => {
  const h = harness(t); await h.open();
  assert.equal(h.tryUnload(), false);
  await h.change('select', 'b');
  await h.change('textarea', 'private draft');
  h.leave();
  assert.equal(h.tryUnload(), true);
  assert.equal(h.subscriptions, 0);
  await h.mount();
  assert.equal(h.requests.length, 1);
  assert.equal(h.tag('select').props.value, 'b');
  assert.equal(h.tag('textarea').props.value, 'private draft');
  await h.change('textarea', 'other');
  assert.equal(h.tryUnload(), false);
  h.leave();
  await h.open(snapshot({ schemes: [alpha, scheme('b', 'Beta', 'external clean edit')] }));
  assert.equal(h.requests.length, 2);
  assert.equal(h.tag('textarea').props.value, 'external clean edit');
  assert.equal(h.confirms.length, 0);
});

test('conflict settling while hidden blocks all mutations through failed reload and restores latest tokens on manual reload', async (t) => {
  const h = harness(t); await h.open(); await h.change('textarea', 'first draft');
  const pending = deferred();
  h.queued.push(() => pending.promise);
  await h.click('Save content');
  h.leave();
  pending.resolve(err('CONFLICT'));
  await h.settle();
  assert.equal(h.afterUnmount, 0);
  await h.mount();
  assert.equal(h.requests.length, 2);
  assert.match(h.alerts(), /manually copy the editor text before clicking Reload/);
  assert.doesNotMatch(h.text, /Copy Draft|SECRET/);
  assert.equal(h.tag('textarea').props.value, 'first draft');
  await h.change('textarea', 'revised draft');
  const save = h.button('Save content');
  const toggle = h.toggle();
  assert.equal(save.props.disabled, true);
  assert.equal(toggle.props.disabled, true);
  save.props.onClick(); toggle.props.onClick();
  assert.equal(h.requests.length, 2);
  h.queued.push(err('IO_ERROR', 500));
  await h.click('Reload');
  assert.equal(h.tag('textarea').props.value, 'revised draft');
  assert.equal(h.button('Save content').props.disabled, true);
  h.queued.push(ok(snapshot({ revision: 'r-external', fileVersion: 'v-external', schemes: [scheme('a', 'Alpha', 'external revision'), beta] })));
  await h.click('Reload');
  assert.equal(h.alerts(), '');
  assert.equal(h.tag('textarea').props.value, 'external revision');
  await h.change('textarea', 'fresh draft');
  h.queued.push(ok(snapshot({ schemes: [scheme('a', 'Alpha', 'fresh draft'), beta] })));
  await h.click('Save content');
  h.assertPost({ type: 'save', id: 'a', content: 'fresh draft' }, 'r-external', 'v-external');
});

test('external content is adopted only after explicit action; other schemes and a local draft are kept', async (t) => {
  const h = harness(t); await h.open(snapshot({ externalChanged: true, fileVersion: 'different-file' }));
  assert.equal(h.requests.length, 1);
  assert.equal(h.toggle().props.disabled, true);
  assert.equal(h.button('New scheme').props.disabled, true);
  assert.doesNotMatch(h.text, /Applied scheme/);
  h.leave(); await h.mount();
  assert.equal(h.requests.length, 1);
  await h.change('textarea', 'unrelated dirty editor');
  const imported = scheme('c', 'Imported', 'external file text');
  h.queued.push(ok(snapshot({ revision: 'r2', fileVersion: 'different-file', schemes: [alpha, beta, imported], selectedId: 'c' })));
  await h.click('Import as new scheme');
  h.assertPost({ type: 'adoptExternal' }, 'r1', 'different-file');
  assert.match(h.text, /Applied scheme: Imported/);
  assert.equal(h.tag('select').props.value, 'a');
  assert.equal(h.tag('textarea').props.value, 'unrelated dirty editor');
  assert.deepEqual(h.all((node) => node.type === 'option').map(text), ['Alpha', 'Beta', 'Imported']);
  assert.equal(h.confirms.length, 0);
});

test('external missing file requires explicit pause and keeps selected scheme', async (t) => {
  const h = harness(t); await h.open(snapshot({ exists: false, externalChanged: true, fileVersion: 'absent' }));
  assert.equal(h.requests.length, 1);
  assert.match(h.alerts(), /file was removed/);
  h.queued.push(ok(snapshot({ exists: false, enabled: false, revision: 'r2', fileVersion: 'absent' })));
  await h.click('Confirm pause');
  h.assertPost({ type: 'adoptExternal' }, 'r1', 'absent');
  assert.match(h.text, /Scheme for next enable: Alpha/);
  assert.match(h.text, /All schemes were kept/);
  assert.equal(h.tag('textarea').props.value, 'baseline');
});

test('a full scheme list permits only confirmed removal of a non-selected scheme to free external import space', async (t) => {
  const schemes = [alpha, beta, ...Array.from({ length: 14 }, (_, i) => scheme(`x${i}`, `X${i}`, ''))];
  const h = harness(t); await h.open(snapshot({ schemes, externalChanged: true }));
  assert.match(h.alerts(), /Scheme limit reached/);
  assert.equal(h.button('Delete scheme').props.disabled, true);
  assert.equal(h.all((node) => node.type === 'button' && text(node) === 'Import as new scheme').length, 0);
  await h.change('select', 'b');
  h.answers.push(false);
  await h.click('Delete scheme');
  assert.equal(h.requests.length, 1);
  h.queued.push(ok(snapshot({ schemes: schemes.filter((item) => item.id !== 'b'), revision: 'r2', externalChanged: true })));
  await h.click('Delete scheme');
  h.assertPost({ type: 'delete', id: 'b' });
  assert.equal(h.button('Import as new scheme').props.disabled, false);
  assert.equal(h.button('Delete scheme').props.disabled, true);
});

test('64 KiB is checked as UTF-8; rejected reload keeps the draft', async (t) => {
  const h = harness(t); await h.open();
  const max = '中'.repeat(21845) + 'a';
  await h.change('textarea', max);
  assert.equal(h.button('Save content').props.disabled, false);
  await h.change('textarea', max + 'b');
  assert.equal(h.button('Save content').props.disabled, true);
  assert.match(h.alerts(), /exceeds the UTF-8 byte limit/);
  h.answers.push(false);
  await h.click('Reload');
  assert.equal(h.requests.length, 1);
  assert.equal(h.tag('textarea').props.value, max + 'b');
});

test('auth, invalid contract, and non-JSON errors do not expose server text or show an invalid editor', async (t) => {
  for (const reply of [err('UNSAFE_PATH', 200), err('AUTH', 403), err('INVALID_STATE'), malformed(401), malformed(500), ok({ content: 'SECRET old envelope' })]) {
    const h = harness(t);
    h.queued.push(reply); await h.mount();
    assert.equal(h.all((node) => node.type === 'textarea').length, 0);
    assert.doesNotMatch(h.alerts(), /SECRET/);
    assert.match(h.alerts(), /unsafe|Access was denied|could not be read safely|operation failed/);
    assert.equal(h.button('Retry').props.disabled, false);
    h.dispose();
  }
});

test('write origin denial is distinguished from login failure and preserves the draft', async (t) => {
  const h = harness(t);
  await h.open();
  await h.change('textarea', 'local draft');
  h.queued.push(err('ORIGIN_REQUIRED', 403));
  await h.click('Save content');
  assert.match(h.alerts(), /failed the origin check/);
  assert.doesNotMatch(h.alerts(), /authentication expired/);
  assert.equal(h.tag('textarea').props.value, 'local draft');
});

test('GET timeout releases busy state and does not warn on page unload', async (t) => {
  const h = harness(t); h.queued.push(abortableFetch); await h.mount();
  assert.equal(h.tryUnload(), false);
  const timer = [...h.timers.values()][0];
  assert.equal(timer.delay, 15000);
  timer.callback(); await h.settle();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.match(h.alerts(), /request timed out/);
  assert.equal(h.button('Retry').props.disabled, false);
  assert.equal(h.timers.size, 0);
});

test('POST timeout, uncertain server IO and malformed success block retries as unconfirmed and keep the draft through remount', async (t) => {
  for (const reply of [abortableFetch, err('IO_ERROR', 500), malformed(200), ok({ invalid: true })]) {
    const h = harness(t); await h.open(); await h.change('textarea', 'private pending draft');
    h.queued.push(reply);
    await h.click('Save content');
    if (reply === abortableFetch) {
      const timer = [...h.timers.values()][0];
      assert.equal(timer.delay, 15000);
      assert.equal(h.tag('textarea').props.disabled, true);
      timer.callback(); await h.settle();
    }
    assert.match(h.alerts(), /outcome is unconfirmed/);
    assert.doesNotMatch(h.alerts(), /SECRET|private pending draft/);
    h.leave(); await h.mount();
    assert.equal(h.requests.length, 2);
    assert.equal(h.tag('textarea').props.value, 'private pending draft');
    assert.equal(h.tag('textarea').props.disabled, false);
    assert.equal(h.button('Save content').props.disabled, true);
    assert.equal(h.timers.size, 0);
    h.dispose();
  }
});

test('pending clean POST survives settings navigation, warns on browser exit, and settles to the server snapshot', async (t) => {
  const h = harness(t); await h.open(); assert.equal(h.tryUnload(), false);
  const pending = deferred();
  h.queued.push(() => pending.promise);
  await h.click(h.toggle());
  h.leave();
  assert.equal(h.requests[1].signal.aborted, false);
  assert.equal(h.tryUnload(), true);
  await h.mount();
  assert.equal(h.requests.length, 2);
  assert.equal(h.toggle().props.disabled, true);
  pending.resolve(ok(snapshot({ revision: 'r2', enabled: false, exists: false })));
  await h.settle();
  assert.equal(h.tryUnload(), false);
  assert.equal(h.toggle().props['aria-checked'], false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.afterUnmount, 0);
});

test('disposing the plugin aborts pending work and removes timer, subscriptions, and unload listener', async (t) => {
  const h = harness(t); await h.open(); await h.change('textarea', 'dirty');
  const pending = deferred();
  h.queued.push(() => pending.promise);
  await h.click('Reload');
  h.leave();
  assert.equal(h.requests[1].signal.aborted, false);
  assert.equal(h.timers.size, 1);
  h.dispose();
  assert.equal(h.requests[1].signal.aborted, true);
  assert.equal(h.tryUnload(), false);
  assert.equal(h.subscriptions, 0);
  assert.equal(h.timers.size, 0);
  pending.resolve(ok(snapshot())); await h.settle();
  assert.equal(h.afterUnmount, 0);
});
