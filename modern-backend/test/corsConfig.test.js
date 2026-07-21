const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cors = require('cors');
const { buildAllowedOrigins, createCorsOptions, normalizeOrigin } = require('../lib/corsConfig');

test('default CORS origins include production and local frontends', () => {
  const origins = buildAllowedOrigins();
  assert.equal(origins.has('https://dailyworks-nu.vercel.app'), true);
  assert.equal(origins.has('http://localhost:5173'), true);
  assert.equal(origins.has('http://localhost:5174'), true);
});

test('configured origins are normalized without allowing arbitrary Vercel sites', () => {
  const origins = buildAllowedOrigins('https://dailyworks-nu.vercel.app/, http://localhost:5173/');
  assert.deepEqual([...origins], [
    'https://dailyworks-nu.vercel.app',
    'http://localhost:5173',
  ]);
  assert.equal(origins.has('https://untrusted.vercel.app'), false);
  assert.equal(normalizeOrigin('not-a-url'), '');
});

test('CORS callback accepts production preflight origin and rejects unknown origins', async () => {
  const options = createCorsOptions();
  const check = origin => new Promise(resolve => {
    options.origin(origin, (error, allowed) => resolve({ error, allowed }));
  });

  const production = await check('https://dailyworks-nu.vercel.app');
  assert.equal(production.error, null);
  assert.equal(production.allowed, true);

  const denied = await check('https://untrusted.vercel.app');
  assert.equal(denied.error.code, 'CORS_ORIGIN_DENIED');
  assert.equal(denied.allowed, undefined);
  assert.equal(options.optionsSuccessStatus, 204);
});

test('production OPTIONS preflight returns the required CORS headers', async () => {
  const app = express();
  app.use(cors(createCorsOptions()));
  app.post('/api/ai/chat', (_request, response) => response.json({ ok: true }));
  const server = app.listen(0);

  try {
    await new Promise(resolve => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/chat`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://dailyworks-nu.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://dailyworks-nu.vercel.app');
    assert.match(response.headers.get('access-control-allow-methods'), /POST/);
    assert.match(response.headers.get('access-control-allow-headers'), /Authorization/i);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
