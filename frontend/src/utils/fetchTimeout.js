// A phone that wakes the app from the background can keep sending requests
// down a connection that died while it slept (the API sits behind Cloudflare,
// which offers HTTP/3). Those requests never fail, they just hang until the OS
// gives up a minute or more later, so pages spin until the app is killed.
// Every request to the API therefore gets a time limit, and reads are retried
// once so the user usually just sees a short delay instead of an error.

export const READ_TIMEOUT_MS = 15 * 1000;
export const WRITE_TIMEOUT_MS = 45 * 1000;

const READ_METHODS = new Set(['GET', 'HEAD']);

export const TIMEOUT_MESSAGE = 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ (ใช้เวลานานเกินไป) กรุณาลองใหม่อีกครั้ง';

function requestUrl(input) {
  if (typeof input === 'string') return input;
  return input?.url || String(input);
}

function requestMethod(input, init) {
  return String(init?.method || input?.method || 'GET').toUpperCase();
}

// 0 = no limit. File uploads can legitimately take minutes on mobile data.
export function requestTimeoutFor(url, method) {
  const verb = String(method || 'GET').toUpperCase();
  if (/\/storage\/v1\/object\//.test(url) && !READ_METHODS.has(verb)) return 0;
  return READ_METHODS.has(verb) ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
}

export function createTimeoutError() {
  const error = new Error(TIMEOUT_MESSAGE);
  error.name = 'TimeoutError';
  return error;
}

// Only reads are retried: repeating an insert or an RPC could save twice.
export function createTimeoutFetch(baseFetch, { retries = 1, timeoutFor = requestTimeoutFor } = {}) {
  return async function timeoutFetch(input, init = {}) {
    const method = requestMethod(input, init);
    const limit = timeoutFor(requestUrl(input), method);
    if (!limit) return baseFetch(input, init);

    const callerSignal = init.signal;
    const maxAttempts = READ_METHODS.has(method) ? retries + 1 : 1;

    for (let attempt = 1; ; attempt += 1) {
      if (callerSignal?.aborted) throw callerSignal.reason ?? createTimeoutError();

      const controller = new AbortController();
      let timedOut = false;
      const forwardAbort = () => controller.abort(callerSignal.reason);
      callerSignal?.addEventListener('abort', forwardAbort, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(createTimeoutError());
      }, limit);

      try {
        return await baseFetch(input, { ...init, signal: controller.signal });
      } catch (error) {
        if (!timedOut) throw error;
        if (attempt < maxAttempts) continue;
        throw createTimeoutError();
      } finally {
        clearTimeout(timer);
        callerSignal?.removeEventListener('abort', forwardAbort);
      }
    }
  };
}

// Same idea for page code loaded on demand: a stalled import() would leave the
// page spinner up forever, and an import cannot be cancelled, so give up on it.
export function withTimeout(promise, limit, makeError = createTimeoutError) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(makeError()), limit);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
