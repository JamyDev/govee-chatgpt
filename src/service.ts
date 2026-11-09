import { createHash } from 'node:crypto';
import { AppError, isScene, publicId, supported, type Backend, type Capability, type Device } from './domain.js';

type Scene = { sceneId: string; name: string; type: string; instance: string; value: unknown };
export class LightService {
  private cache?: { until: number; devices: Device[] };
  private discovery?: Promise<Device[]>;
  private sceneCache = new Map<string, { until: number; scenes: Scene[] }>();
  constructor(readonly backend: Backend, private readonly allowedDevices: string[] = [], private readonly now = () => Date.now()) {}
  private async devices(): Promise<Device[]> {
    if (this.cache && this.cache.until > this.now()) return this.cache.devices;
    if (!this.discovery) this.discovery = this.backend.devices().then(devices => {
      const lights = devices.filter(d => d.type === 'devices.types.light' && (!this.allowedDevices.length || this.allowedDevices.includes(d.device)));
      this.cache = { until: this.now() + 60_000, devices: lights }; return lights;
    }).finally(() => { this.discovery = undefined; });
    return this.discovery;
  }
  async list() {
    return { demo: this.backend.demo, lights: (await this.devices()).map(d => ({
      lightId: publicId(d.sku, d.device), name: d.deviceName, model: d.sku,
      controls: Object.fromEntries(Object.entries(supported).map(([name, pair]) => {
        const cap = d.capabilities.find(c => c.type === pair[0] && c.instance === pair[1]);
        return [name, cap ? { supported: true, ...(cap.parameters?.range ? { range: cap.parameters.range } : {}) } : { supported: false }];
      })), scenesSupported: d.capabilities.some(isScene),
    })) };
  }
  private async device(lightId: string) {
    const device = (await this.devices()).find(d => publicId(d.sku, d.device) === lightId);
    if (!device) throw new AppError('light_not_found', 'Unknown or disallowed light. List lights first and use an exact lightId.');
    return device;
  }
  async state(lightId: string) {
    const device = await this.device(lightId);
    const caps = await this.backend.state(device);
    const value = (type: string, instance: string) => caps.find(c => c.type === type && c.instance === instance)?.state?.value ?? null;
    return { demo: this.backend.demo, lightId, name: device.deviceName, fetchedAt: new Date(this.now()).toISOString(),
      online: value('devices.capabilities.online', 'online'), power: value(...supported.power),
      brightness: value(...supported.brightness), rgb: value(...supported.rgb), temperatureK: value(...supported.temperature),
      note: 'Cloud-reported state may lag physical devices; null means unknown.' };
  }
  private validate(cap: Capability, value: number) {
    const params = cap.parameters;
    if (params?.options) {
      if (!params.options.some(option => option.value === value)) throw new AppError('unsupported_value', 'This light does not advertise that value.');
      return;
    }
    const range = params?.range;
    if (!range || !Number.isSafeInteger(value) || value < range.min || value > range.max)
      throw new AppError('unsupported_value', 'Value is outside this light’s advertised range, or the range is unknown. List lights to inspect supported ranges.');
  }
  async set(lightId: string, kind: keyof typeof supported, value: number, signal?: AbortSignal) {
    const device = await this.device(lightId);
    const [type, instance] = supported[kind];
    const cap = device.capabilities.find(c => c.type === type && c.instance === instance);
    if (!cap) throw new AppError('unsupported_capability', 'This light does not advertise that control.');
    this.validate(cap, value);
    await this.backend.control(device, { type, instance, value }, signal);
    return { demo: this.backend.demo, lightId, accepted: true, control: kind, requestedValue: value,
      note: 'Command accepted by the API, not a verified physical change. Read state if confirmation is needed. Do not retry blindly.' };
  }
  private async scenes(lightId: string) {
    const device = await this.device(lightId);
    const cached = this.sceneCache.get(lightId);
    if (cached && cached.until > this.now()) return cached.scenes;
    const staticCaps = device.capabilities.filter(isScene);
    if (!staticCaps.length) throw new AppError('unsupported_capability', 'This light does not advertise supported scenes.');
    const dynamic = staticCaps.some(c => c.type === 'devices.capabilities.dynamic_scene') ? await this.backend.scenes(device) : [];
    const options: Scene[] = [];
    for (const cap of [...staticCaps, ...dynamic.filter(isScene)]) for (const option of cap.parameters?.options ?? []) {
      if (option.value === undefined) continue;
      const sceneId = `scene_${createHash('sha256').update(JSON.stringify([lightId, cap.type, cap.instance, option.value])).digest('hex').slice(0, 20)}`;
      if (!options.some(s => s.sceneId === sceneId)) options.push({ sceneId, name: option.name, type: cap.type, instance: cap.instance, value: option.value });
    }
    this.sceneCache.set(lightId, { until: this.now() + 300_000, scenes: options });
    return options;
  }
  async listScenes(lightId: string) {
    return { demo: this.backend.demo, lightId, scenes: (await this.scenes(lightId)).map(({ sceneId, name }) => ({ sceneId, name })) };
  }
  async setScene(lightId: string, sceneId: string, signal?: AbortSignal) {
    const device = await this.device(lightId);
    const scene = (await this.scenes(lightId)).find(s => s.sceneId === sceneId);
    if (!scene) throw new AppError('scene_not_found', 'Unknown or stale scene. List scenes for this light, then choose an exact sceneId.');
    await this.backend.control(device, { type: scene.type, instance: scene.instance, value: scene.value }, signal);
    return { demo: this.backend.demo, lightId, sceneId, accepted: true, note: 'Scene command accepted by the API; physical change is not verified.' };
  }
}
