import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoBackend, demoDevice } from '../src/demo.js';
import { LightService } from '../src/service.js';
import { publicId, type Device } from '../src/domain.js';
const id = publicId(demoDevice.sku, demoDevice.device);

test('lists only lights, excludes disallowed device IDs and caches discovery', async () => {
  let calls = 0;
  const backend = new DemoBackend();
  backend.devices = async () => { calls++; return [demoDevice, { ...demoDevice, device: 'heater', type: 'devices.types.heater' }]; };
  const service = new LightService(backend);
  const [a, b] = await Promise.all([service.list(), service.list()]);
  assert.equal(a.lights.length, 1); assert.deepEqual(a, b); assert.equal(calls, 1);
  assert.equal((await new LightService(backend, ['not-allowed']).list()).lights.length, 0);
});
test('cache expires and does not cache failures', async () => {
  let now = 0, calls = 0;
  const backend = new DemoBackend();
  backend.devices = async () => { calls++; if (calls === 1) throw Error(); return [demoDevice]; };
  const service = new LightService(backend, [], () => now);
  await assert.rejects(service.list()); await service.list(); await service.list(); assert.equal(calls, 2);
  now = 60_001; await service.list(); assert.equal(calls, 3);
});
test('sets power, brightness, RGB and temperature on demo light', async () => {
  const service = new LightService(new DemoBackend());
  await service.set(id, 'power', 1); await service.set(id, 'brightness', 42);
  await service.set(id, 'rgb', 0x123456); await service.set(id, 'temperature', 2700);
  const state = await service.state(id);
  assert.equal(state.demo, true); assert.equal(state.power, 1); assert.equal(state.brightness, 42);
  assert.equal(state.rgb, 0x123456); assert.equal(state.temperatureK, 2700);
});
test('rejects unknown ID, unsupported capability and out of range values without writes', async () => {
  const backend = new DemoBackend(); let writes = 0;
  backend.control = async () => { writes++; };
  const service = new LightService(backend);
  await assert.rejects(service.set('invented', 'power', 1), /Unknown/);
  for (const v of [0, 101, 1.5, NaN]) await assert.rejects(service.set(id, 'brightness', v), /range/);
  await assert.rejects(service.set(id, 'power', 2), /advertise/);
  const reduced: Device = { ...demoDevice, capabilities: [] };
  backend.devices = async () => [reduced];
  await assert.rejects(new LightService(backend).set(id, 'rgb', 5), /advertise/);
  assert.equal(writes, 0);
});
test('scenes retain opaque object values and reject fabricated IDs', async () => {
  const backend = new DemoBackend(); const commands: unknown[] = [];
  backend.control = async (_d, command) => { commands.push(command); };
  const service = new LightService(backend);
  const scenes = await service.listScenes(id);
  assert.equal(scenes.scenes.length, 2);
  await service.setScene(id, scenes.scenes[0]!.sceneId);
  assert.deepEqual(commands, [{ type: 'devices.capabilities.dynamic_scene', instance: 'lightScene', value: { id: 1, paramId: 100 } }]);
  await assert.rejects(service.setScene(id, 'invented'), /Unknown/);
  assert.equal(commands.length, 1);
});
test('missing state stays unknown rather than claiming off', async () => {
  const backend = new DemoBackend(); backend.state = async () => [];
  const state = await new LightService(backend).state(id);
  assert.equal(state.power, null); assert.equal(state.online, null);
});
