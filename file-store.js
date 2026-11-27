import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';

// Shared by every instance in this module, not merely by one editor instance.
const queues = new Map();
const fail = (code, message) => Object.assign(new Error(message), { code });
export const instructionFileVersion = (exists, bytes) => createHash('sha256')
  .update(exists ? 'present\0' : 'absent\0').update(bytes).digest('hex');
const missing = (error) => error?.code === 'ENOENT';
const unsafe = () => fail('UNSAFE_PATH', 'The instructions path is not a safe regular file.');
const knownCodes = new Set(['INVALID_ARGUMENT', 'INVALID_UTF8', 'TOO_LARGE', 'UNSAFE_PATH', 'CONFLICT']);

const INSTRUCTIONS = 'AGENTS.md';
const SCHEMES = '.global-instructions-schemes.json';
const CONTENT_LIMIT = 65536;
// At most two groups of 16 schemes, each with up to 64 KiB of content.
// JSON can take six bytes per content byte, plus bounded names and metadata.
const SIDECAR_LIMIT = 13 * 1024 * 1024;

class FixedUtf8Store {
  #home;
  #basename;
  #path;
  #maxBytes;

  constructor(basename, options = {}) {
    const { home, maxBytes = CONTENT_LIMIT } = options || {};
    if ((basename !== INSTRUCTIONS && basename !== SCHEMES) ||
        typeof home !== 'string' || !home.trim() || home.includes('\0') ||
        !Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 0x7ffffffe) {
      throw fail('INVALID_ARGUMENT', 'A home directory and a valid byte limit are required.');
    }
    this.#home = path.resolve(home);
    this.#basename = basename;
    this.#path = path.join(this.#home, basename);
    this.#maxBytes = maxBytes;
  }

  get home() { return this.#home; }
  get path() { return this.#path; }
  get maxBytes() { return this.#maxBytes; }

  async read() {
    return FixedUtf8Store.withFiles([this], ([file]) => file.read());
  }

  async save(input = {}) {
    return FixedUtf8Store.withFiles([this], ([file]) => file.save(input));
  }

  // The same home lock covers legacy reads/saves and multi-file transactions.
  // Lock-held operations are scoped to the callback and never reacquire the lock.
  static async withFiles(files, operation) {
    const home = files[0].#home;
    const key = process.platform === 'win32' ? home.toLowerCase() : home;
    const previous = queues.get(key) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      let active = true;
      const guarded = (file, callback) => {
        if (!active) throw fail('INVALID_ARGUMENT', 'The file transaction is closed.');
        return file.#guard(callback);
      };
      try {
        return await operation(files.map((file) => ({
          read: () => guarded(file, async () => (await file.#snapshot()).result),
          save: (input, beforeReplace) => guarded(file, () => file.#save(input?.content, input?.version, beforeReplace)),
        })));
      } finally {
        active = false;
      }
    });
    queues.set(key, pending);
    try {
      return await pending;
    } finally {
      if (queues.get(key) === pending) queues.delete(key);
    }
  }

  async #guard(operation) {
    try {
      return await operation();
    } catch (error) {
      if (knownCodes.has(error?.code)) throw error;
      if (['ELOOP', 'ENOTDIR', 'EISDIR'].includes(error?.code)) throw unsafe();
      // Never expose OS messages, causes, buffers, or user-supplied document text.
      throw fail('IO_ERROR', 'The global instructions file could not be accessed safely.');
    }
  }

  async #ancestors(create = false) {
    const root = path.parse(this.#home).root;
    const parts = path.relative(root, this.#home).split(path.sep).filter(Boolean);
    let current = root;
    for (const part of [null, ...parts]) {
      if (part !== null) current = path.join(current, part);
      let stat;
      try {
        stat = await fs.lstat(current);
      } catch (error) {
        if (!missing(error)) throw error;
        if (!create) return false;
        try {
          await fs.mkdir(current, { mode: 0o700 });
        } catch (mkdirError) {
          if (mkdirError.code !== 'EEXIST') throw mkdirError;
        }
        stat = await fs.lstat(current);
      }
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw unsafe();
      // Windows junctions/reparse points may be reported as directories by
      // some runtimes. Resolve every prefix, not only the final home path.
      if (!this.#samePath(await fs.realpath(current), current)) throw unsafe();
    }
    return true;
  }

  #samePath(a, b) {
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  }

  #result(exists, bytes, content) {
    return { path: this.#path, exists, content, version: instructionFileVersion(exists, bytes),
      bytes: bytes.length, maxBytes: this.#maxBytes };
  }

  async #snapshot() {
    const absent = () => ({ result: this.#result(false, Buffer.alloc(0), ''), mode: null });
    if (!await this.#ancestors()) return absent();
    let entry;
    try {
      entry = await fs.lstat(this.#path);
    } catch (error) {
      if (missing(error)) return absent();
      throw error;
    }
    if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1) throw unsafe();
    if (!this.#samePath(await fs.realpath(this.#path), this.#path)) throw unsafe();
    let handle;
    try {
      handle = await fs.open(this.#path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== entry.dev || stat.ino !== entry.ino) throw unsafe();
      if (stat.size > this.#maxBytes) throw fail('TOO_LARGE', 'The instructions exceed the byte limit.');
      // Bounded reading also protects against a file growing after stat(). Never truncate.
      let buffer = Buffer.alloc(stat.size + 1);
      let length = 0;
      for (;;) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
        if (length > this.#maxBytes) throw fail('TOO_LARGE', 'The instructions exceed the byte limit.');
        if (length === buffer.length) {
          const larger = Buffer.alloc(Math.min(this.#maxBytes + 1, buffer.length * 2));
          buffer.copy(larger);
          buffer = larger;
        }
      }
      const bytes = buffer.subarray(0, length);
      let content;
      try {
        content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        throw fail('INVALID_UTF8', 'The instructions are not valid UTF-8.');
      }
      await this.#ancestors();
      const final = await fs.lstat(this.#path);
      if (final.isSymbolicLink() || !final.isFile() || final.nlink !== 1 ||
          final.dev !== stat.dev || final.ino !== stat.ino) throw unsafe();
      return { result: this.#result(true, bytes, content), mode: stat.mode & 0o7777 };
    } finally {
      await handle?.close();
    }
  }

  async #save(content, version, beforeReplace) {
    if (typeof content !== 'string' || typeof version !== 'string') {
      throw fail('INVALID_ARGUMENT', 'Content and the previously read version are required.');
    }
    const bytes = Buffer.from(content, 'utf8');
    // Buffer.from replaces isolated UTF-16 surrogates; refuse that silent data loss.
    if (bytes.toString('utf8') !== content) throw fail('INVALID_UTF8', 'Content must encode as valid UTF-8.');
    if (bytes.length > this.#maxBytes) throw fail('TOO_LARGE', 'The instructions exceed the byte limit.');
    const current = await this.#snapshot();
    if (current.result.version !== version) throw fail('CONFLICT', 'Instructions changed; read again before saving.');
    await this.#ancestors(true);
    let temporary;
    let handle;
    try {
      // Exclusive creation: do not open or overwrite a pre-existing temporary path.
      const candidate = path.join(this.#home, `.${this.#basename}.${randomUUID()}.tmp`);
      handle = await fs.open(candidate, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      temporary = candidate;
      await handle.writeFile(bytes);
      if (current.mode !== null) await handle.chmod(current.mode);
      await handle.sync();
      await handle.close();
      handle = null;
      const checked = await this.#snapshot();
      if (checked.result.version !== version || checked.mode !== current.mode) {
        throw fail('CONFLICT', 'Instructions changed; read again before saving.');
      }
      await beforeReplace?.();
      // Best-effort CAS against external editors, NOT a filesystem transaction:
      // arbitrary third-party writes/replacements (including ancestor swaps) in
      // the check/rename interval cannot be completely prevented by Node APIs.
      // In-process saves are serialized. Never delete the destination to make
      // Windows rename succeed: a sharing/read-only error must preserve it.
      await fs.rename(temporary, this.#path);
      temporary = null;
      return this.#result(true, bytes, content);
    } finally {
      try {
        await handle?.close();
      } finally {
        if (temporary) await fs.unlink(temporary);
      }
    }
  }
}

/** Only edits <home>/AGENTS.md. No project/shared lookup or host integration. */
export class GlobalInstructionsStore extends FixedUtf8Store {
  constructor(options) {
    super(INSTRUCTIONS, options);
  }
}

/** Fixed file pair for scheme operations; no basename or path comes from the caller. */
export function openInstructionFiles({ home }) {
  const projection = new FixedUtf8Store(INSTRUCTIONS, { home });
  const sidecar = new FixedUtf8Store(SCHEMES, { home, maxBytes: SIDECAR_LIMIT });
  return {
    run: (operation) => FixedUtf8Store.withFiles([projection, sidecar], operation),
  };
}
