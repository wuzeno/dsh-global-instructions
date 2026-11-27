import { homedir } from 'node:os';
import { join } from 'node:path';
import { TextDecoder } from 'node:util';
import { InstructionSchemesStore } from './scheme-store.js';

export const inject = ['connection', 'webServer'];
export const ROUTE = '/api/plugins/global-instructions/schemes';
export const MAX_REQUEST_BYTES = 400 * 1024;

const statuses = {
  INVALID_ARGUMENT: 400, INVALID_UTF8: 400, INVALID_JSON: 400,
  TOO_LARGE: 413, UNSAFE_PATH: 409, CONFLICT: 409, IO_ERROR: 500,
  SCHEME_LIMIT: 409, INVALID_STATE: 409,
};
const messages = {
  INVALID_ARGUMENT: 'A valid action and the previously read versions are required.',
  SCHEME_LIMIT: 'The instruction scheme limit has been reached.',
  INVALID_STATE: 'Instruction scheme data could not be recovered automatically.',
  INVALID_UTF8: 'The document or request is not valid UTF-8.',
  INVALID_JSON: 'The request must contain a JSON object.',
  TOO_LARGE: 'The request or document exceeds the size limit.',
  UNSAFE_PATH: 'The global instructions path is not a safe regular file.',
  CONFLICT: 'Instructions changed; reload before saving.',
  IO_ERROR: 'The global instructions file could not be accessed safely.',
};
const failure = (code) => Object.assign(new Error(code), { code });

function json(res, status, body, extra = {}) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
  res.end(JSON.stringify(body));
}
function reject(res, status, code, message, extra) {
  json(res, status, { ok: false, error: { code, message } }, extra);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin === undefined) {
    // The Desktop relay removes Origin and Sec-Fetch-Site but preserves custom
    // headers. Cross-origin browsers cannot send this non-safelisted header
    // without a successful CORS preflight, which this route does not allow.
    const site = req.headers['sec-fetch-site'];
    return req.headers['x-dsh-instructions-write'] === '1' && (site === undefined || site === 'same-origin');
  }
  if (typeof origin !== 'string' || typeof host !== 'string' || !host || /[\s\\/@?#]/u.test(host)) return false;
  try {
    // Do not trust arbitrary X-Forwarded-* headers. The mounted carrier owns TLS.
    const target = new URL(`${req.socket.encrypted ? 'https:' : 'http:'}//${host}`);
    const source = new URL(origin);
    return origin === source.origin && source.origin === target.origin;
  } catch { return false; }
}

async function readBody(req) {
  const length = req.headers['content-length'];
  if (length !== undefined && (!/^\d+$/u.test(length) || Number(length) > MAX_REQUEST_BYTES)) {
    throw failure('TOO_LARGE');
  }
  const chunks = [];
  let size = 0;
  // Iterating IncomingMessage directly destroys its socket on early throw; retain
  // the iterator so an over-limit request can receive a structured 413 instead.
  const iterator = req.iterator({ destroyOnReturn: false });
  try {
    for await (const chunk of iterator) {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) throw failure('TOO_LARGE');
      chunks.push(chunk);
    }
  } finally {
    // Responses below set Connection: close on body failures; resume does not
    // allocate another buffer and prevents leaving this request paused.
    req.resume();
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)); }
  catch { throw failure('INVALID_UTF8'); }
  let value;
  try { value = JSON.parse(text); } catch { throw failure('INVALID_JSON'); }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw failure('INVALID_JSON');
  const isToken = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/u.test(token);
  if (Object.keys(value).some(key => key !== 'revision' && key !== 'fileVersion' && key !== 'action') ||
      !isToken(value.revision) || !isToken(value.fileVersion) || value.action === null ||
      typeof value.action !== 'object' || Array.isArray(value.action)) throw failure('INVALID_ARGUMENT');
  return value;
}

/** Fixed owner-only route; exported separately for isolated temporary-store tests. */
export function createGlobalInstructionsHandler({ connection, store }) {
  return async (req, res) => {
    try {
      // Recheck the pathname so direct handler reuse cannot broaden this route.
      if (new URL(req.url, 'http://route.invalid').pathname !== ROUTE) {
        reject(res, 404, 'NOT_FOUND', 'Route not found.'); return;
      }
      const admission = connection.admit({ headers: req.headers });
      if ('rejection' in admission) {
        reject(res, admission.rejection, 'UNAUTHORIZED', 'The request was not admitted.', { Connection: 'close' }); return;
      }
      if (admission.peer.principal.kind !== 'owner') {
        reject(res, 403, 'FORBIDDEN', 'Only the owner may access global instructions.', { Connection: 'close' }); return;
      }
      if (req.method !== 'GET' && req.method !== 'POST') {
        reject(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are supported.', { Allow: 'GET, POST', Connection: 'close' }); return;
      }
      if (req.method === 'GET') {
        json(res, 200, { ok: true, value: await store.read() }); return;
      }
      if (!sameOrigin(req)) {
        reject(res, 403, 'ORIGIN_REQUIRED', 'Saving requires a same-origin browser request.', { Connection: 'close' }); return;
      }
      const type = req.headers['content-type'];
      if (typeof type !== 'string' || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/iu.test(type) ||
          req.headers['content-encoding'] !== undefined) {
        reject(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Use uncompressed application/json with UTF-8.', { Connection: 'close' }); return;
      }
      const body = await readBody(req);
      json(res, 200, { ok: true, value: await store.mutate(body) });
    } catch (error) {
      const code = Object.hasOwn(statuses, error?.code) ? error.code : 'IO_ERROR';
      // Never serialize OS error text, request bodies, stack traces, or causes.
      reject(res, statuses[code], code, messages[code], { Connection: 'close' });
    }
  };
}

export function apply(ctx) {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  const store = new InstructionSchemesStore({ home });
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: ROUTE,
    handler: createGlobalInstructionsHandler({ connection: ctx.connection, store }),
  }));
}
