import test from 'node:test';
import assert from 'node:assert/strict';
import { GoveeBackend, RequestLimiter } from '../src/govee.js';
import { demoDevice } from '../src/demo.js';
import { errorResult } from '../src/domain.js';
const immediate = () => new RequestLimiter(() => 10000, async () => {});
const fake = (fn: (url: string, init: RequestInit) => Promise<Response> | Response) => (async (url, init) => fn(String(url), init!)) as typeof fetch;
const reply = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });

test('uses router API, headers, requestId, exact discovered device and control value', async () => {
  let sent: RequestInit | undefined;
  const api = new GoveeBackend('test-secret', fake((url, init) => {
    assert.equal(url, 'https://openapi.api.govee.com/router/api/v1/device/control'); sent = init; return reply({ code: 200 });
  }), immediate());
  const command = { type: 'devices.capabilities.on_off', instance: 'powerSwitch', value: 1 };
  await api.control(demoDevice, command);
  const body = JSON.parse(String(sent!.body));
  assert.match(body.requestId, /^[a-f0-9-]{36}$/);
  assert.deepEqual(body.payload, { sku: demoDevice.sku, device: demoDevice.device, capability: command });
  assert.equal((sent!.headers as Record<string,string>)['Govee-API-Key'], 'test-secret');
  assert.equal(sent!.redirect, 'error');
});
test('parses discovery and state envelopes', async () => {
  const api = new GoveeBackend('test-secret', fake(url => reply(url.endsWith('/user/devices') ? { code: 200, data: [demoDevice] } : { code: 200, payload: { capabilities: [] } })), immediate());
  assert.equal((await api.devices()).length, 1); assert.deepEqual(await api.state(demoDevice), []);
});
test('honors rate limit advice without retrying a write', async () => {
  let requests = 0;
  const api = new GoveeBackend('test-secret', fake(() => { requests++; return reply({}, 429, { 'Retry-After': '12' }); }), immediate());
  await assert.rejects(api.control(demoDevice, { type: 'x', instance: 'x', value: 1 }), (err: any) => err.code === 'rate_limited' && err.retryAfterSeconds === 12);
  assert.equal(requests, 1);
});
for (const [status, body, code] of [[401, { secret: 'test-secret' }, 'upstream_authentication_failed'], [500, {}, 'upstream_error'], [200, { code: 400, message: 'test-secret' }, 'upstream_rejected'], [200, { code: 429 }, 'rate_limited'], [200, { unexpected: true }, 'invalid_upstream_response']] as const) {
  test(`sanitizes upstream failure ${status}/${code}`, async () => {
    const api = new GoveeBackend('test-secret', fake(() => reply(body, status)), immediate());
    try { await api.devices(); assert.fail('must fail'); }
    catch (err: any) { assert.equal(err.code, code); assert.ok(!JSON.stringify(errorResult(err)).includes('test-secret')); }
  });
}
test('timeout/network errors are sanitized and outcome is uncertain', async () => {
  let requests = 0;
  const api = new GoveeBackend('test-secret', fake(() => { requests++; throw Error('test-secret'); }), immediate());
  await assert.rejects(api.control(demoDevice, { type: 'x', instance: 'x', value: 1 }), /outcome.*unknown/);
  assert.equal(requests, 1);
});
test('request limiter serializes concurrent work and enforces interval', async () => {
  let now = 0; const starts: number[] = [];
  const limiter = new RequestLimiter(() => now, async ms => { now += ms; });
  await Promise.all([1,2,3].map(() => limiter.run('control', 600, async () => { starts.push(now); })));
  assert.deepEqual(starts, [0,600,1200]);
});
test('limiter discards expired and aborted work before dispatch', async () => {
  let calls = 0;
  const limiter = new RequestLimiter(() => 100, async () => {});
  await assert.rejects(limiter.run('x', 0, async () => { calls++; }, undefined, 50), /cancelled/);
  await assert.rejects(limiter.run('x', 0, async () => { calls++; }, AbortSignal.abort()), /cancelled/);
  assert.equal(calls, 0);
});
test('bounds upstream JSON response size', async () => {
  const api = new GoveeBackend('test-secret', fake(() => reply({ code: 200, data: 'x'.repeat(1_048_577) })), immediate());
  await assert.rejects(api.devices(), /unexpected response/);
});
