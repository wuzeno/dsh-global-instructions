import { createHash, randomUUID } from 'node:crypto';
import { instructionFileVersion, openInstructionFiles } from './file-store.js';

const MAX_SCHEMES = 16;
const MAX_BYTES = 65536;
const DEFAULT_ID = 'default';
const DEFAULT_NAME = '默认方案';
const ABSENT = instructionFileVersion(false, Buffer.alloc(0));
const EMPTY = instructionFileVersion(true, Buffer.alloc(0));
const token = (value) => typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value);
const schemeId = (value) => value === DEFAULT_ID || (typeof value === 'string' && value.length === 36 &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value));
const fail = (code, message) => Object.assign(new Error(message), { code });
const invalid = (message) => fail('INVALID_ARGUMENT', message);
const conflict = () => fail('CONFLICT', 'Instructions changed; read again before mutating schemes.');
const invalidState = () => fail('INVALID_STATE', 'The instructions scheme metadata is invalid or needs manual recovery.');
const revisionOf = (value) => createHash('sha256').update(value).digest('hex');
const nameKey = (name) => name.normalize('NFC').toLowerCase().replace(/\u03c2/g, 'σ').normalize('NFC');
const wellFormed = (value) => !/[\uD800-\uDFFF]/u.test(value);
const validName = (name) => typeof name === 'string' && name.length > 0 && name.length <= 120 &&
  [...name].length <= 60 && wellFormed(name) && name.trim() === name;
const validContent = (content) => typeof content === 'string' && content.length <= MAX_BYTES &&
  wellFormed(content) && Buffer.byteLength(content) <= MAX_BYTES;
const versionFor = (content) => instructionFileVersion(true, Buffer.from(content, 'utf8'));
const object = (value) => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value, keys) => object(value) && Reflect.ownKeys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const selected = (state) => state.schemes.find(({ id }) => id === state.selectedId);

function validState(state) {
  if (!exact(state, ['revision', 'fileVersion', 'schemes', 'selectedId', 'enabled']) ||
      !token(state.revision) || !token(state.fileVersion) || typeof state.enabled !== 'boolean' ||
      !Array.isArray(state.schemes) || state.schemes.length < 1 || state.schemes.length > MAX_SCHEMES) return false;
  const names = new Set();
  const ids = new Set();
  for (const scheme of state.schemes) {
    if (!exact(scheme, ['id', 'name', 'content']) || !schemeId(scheme.id) || !validName(scheme.name) ||
        !validContent(scheme.content) || ids.has(scheme.id)) return false;
    const name = nameKey(scheme.name);
    if (names.has(name)) return false;
    names.add(name);
    ids.add(scheme.id);
  }
  if (!ids.has(state.selectedId)) return false;
  return state.enabled ? state.fileVersion === versionFor(selected(state).content) :
    (state.fileVersion === EMPTY || state.fileVersion === ABSENT);
}

function virtualState(file) {
  return {
    revision: revisionOf(`virtual instruction schemes v1\0${file.version}`),
    fileVersion: file.version,
    schemes: [{ id: DEFAULT_ID, name: DEFAULT_NAME, content: file.content }],
    selectedId: DEFAULT_ID,
    enabled: file.exists,
  };
}

function readState(sidecar, file) {
  if (!sidecar.exists) return virtualState(file);
  let record;
  try {
    record = JSON.parse(sidecar.content);
  } catch {
    throw invalidState();
  }
  if (record?.schema !== 1) throw invalidState();
  if (exact(record, ['schema', 'state']) && validState(record.state)) return record.state;
  if (!exact(record, ['schema', 'from', 'to', 'committed', 'next']) ||
      !validState(record.committed) || !validState(record.next) || record.from === record.to ||
      record.from !== record.committed.fileVersion || record.to !== record.next.fileVersion ||
      record.to === ABSENT || record.committed.revision === record.next.revision) throw invalidState();
  // Read-only recovery. A later successful mutation can replace a resolved
  // journal. A third version is ambiguous; do not erase either stored state.
  if (file.version === record.to) return record.next;
  if (file.version === record.from) return record.committed;
  throw invalidState();
}

function snapshot(state, file) {
  return {
    revision: state.revision,
    fileVersion: file.version,
    path: file.path,
    exists: file.exists,
    maxBytes: file.maxBytes,
    schemes: state.schemes,
    selectedId: state.selectedId,
    enabled: state.enabled,
    externalChanged: file.version !== state.fileVersion,
  };
}

const actions = new Map([
  ['create', ['type', 'name']], ['rename', ['type', 'id', 'name']],
  ['delete', ['type', 'id']], ['save', ['type', 'id', 'content']],
  ['select', ['type', 'id']], ['setEnabled', ['type', 'enabled']], ['adoptExternal', ['type']],
]);

function parseMutation(input) {
  if (!exact(input, ['revision', 'fileVersion', 'action']) || !token(input.revision) || !token(input.fileVersion)) {
    throw invalid('The previously read scheme revision and file version are required.');
  }
  const { action } = input;
  const keys = object(action) && actions.get(action.type);
  if (!keys || !exact(action, keys)) throw invalid('Unsupported scheme action or action fields.');
  if (keys.includes('id') && !schemeId(action.id)) throw invalid('A scheme ID is required.');
  const parsed = { ...action };
  if (keys.includes('name')) {
    parsed.name = typeof action.name === 'string' ? action.name.trim() : action.name;
    if (!validName(parsed.name)) throw invalid('A name of 1 to 60 Unicode code points is required.');
  }
  if (action.type === 'save') {
    if (typeof action.content !== 'string') throw invalid('Scheme content must be a string.');
    if (!wellFormed(action.content)) throw fail('INVALID_UTF8', 'Scheme content must encode as valid UTF-8.');
    if (!validContent(action.content)) throw fail('TOO_LARGE', 'Scheme content exceeds the byte limit.');
  }
  if (action.type === 'setEnabled' && typeof action.enabled !== 'boolean') throw invalid('Enabled must be a boolean.');
  return { revision: input.revision, fileVersion: input.fileVersion, action: parsed };
}

function changeState(state, file, action) {
  const changed = file.version !== state.fileVersion;
  // Free one slot for explicit adoption without discarding any scheme implicitly
  // or repointing the committed projection at still-unadopted external bytes.
  const capacityEscape = changed && file.exists && state.schemes.length === MAX_SCHEMES && action.type === 'delete';
  if (changed && action.type !== 'adoptExternal' && !capacityEscape) throw conflict();
  const next = { ...state, schemes: [...state.schemes], revision: revisionOf(`${state.revision}\0${randomUUID()}`) };
  const index = next.schemes.findIndex(({ id }) => id === action.id);
  if (Object.hasOwn(action, 'id') && index < 0) throw invalid('The scheme does not exist.');
  const nameTaken = (name, except) => next.schemes.some((scheme) =>
    scheme.id !== except && nameKey(scheme.name) === nameKey(name));
  const add = (name, content) => {
    if (next.schemes.length >= MAX_SCHEMES) throw fail('SCHEME_LIMIT', 'The maximum number of schemes has been reached.');
    if (nameTaken(name)) throw invalid('Another scheme already uses this name.');
    const id = randomUUID();
    next.schemes.push({ id, name, content });
    return id;
  };
  switch (action.type) {
    case 'create': add(action.name, ''); break;
    case 'rename':
      if (nameTaken(action.name, action.id)) throw invalid('Another scheme already uses this name.');
      next.schemes[index] = { ...next.schemes[index], name: action.name };
      break;
    case 'delete':
      if (next.schemes.length === 1 || next.selectedId === action.id) throw invalid('Cannot delete the selected or last scheme.');
      next.schemes.splice(index, 1);
      break;
    case 'save': next.schemes[index] = { ...next.schemes[index], content: action.content }; break;
    case 'select': next.selectedId = action.id; break;
    case 'setEnabled': next.enabled = action.enabled; break;
    case 'adoptExternal': {
      if (!changed) throw invalid('There are no external changes to adopt.');
      if (file.exists) {
        const base = '外部导入';
        let name = base;
        for (let n = 2; nameTaken(name); n += 1) name = `${base} ${n}`;
        next.selectedId = add(name, file.content);
      }
      next.enabled = file.exists;
      next.fileVersion = file.version;
      return { next };
    }
  }
  if (capacityEscape) return { next };
  const content = next.enabled ? selected(next).content : '';
  next.fileVersion = next.enabled || file.exists ? versionFor(content) : ABSENT;
  return {
    next,
    ...(next.fileVersion !== file.version ? { projection: content } : {}),
  };
}

export class InstructionSchemesStore {
  #files;

  constructor(options = {}) {
    this.#files = openInstructionFiles({ home: options?.home });
  }

  async read() {
    return this.#files.run(async ([projection, sidecar]) => {
      const saved = await sidecar.read();
      const file = await projection.read();
      return snapshot(readState(saved, file), file);
    });
  }

  async mutate(input) {
    return this.#files.run(async ([projection, sidecar]) => {
      const { revision, fileVersion, action } = parseMutation(input);
      const saved = await sidecar.read();
      let file = await projection.read();
      const state = readState(saved, file);
      if (revision !== state.revision || fileVersion !== file.version) throw conflict();
      const { next, projection: content } = changeState(state, file, action);
      const saveSidecar = (record, version, expectedFileVersion) => sidecar.save({
        content: JSON.stringify({ schema: 1, ...record }), version,
      }, async () => {
        if ((await projection.read()).version !== expectedFileVersion) throw conflict();
      });
      if (content === undefined) {
        await saveSidecar({ state: next }, saved.version, file.version);
      } else {
        const journal = await saveSidecar({ from: file.version, to: next.fileVersion, committed: state, next },
          saved.version, file.version);
        file = await projection.save({ content, version: file.version });
        await saveSidecar({ state: next }, journal.version, next.fileVersion);
      }
      return snapshot(next, file);
    });
  }
}
