import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError, capabilitySchema, deviceSchema, type Backend, type Command, type Device } from './domain.js';

const BASE = 'https://openapi.api.govee.com/router/api/v1';
const envelopeSchema = z.object({ code: z.number(), data: z.unknown().optional(), payload: z.unknown().optional() });
const capsSchema = z.object({ capabilities: z.array(capabilitySchema) });

/** A bounded, process-local limiter. Run only one replica per Govee key. */
export class RequestLimiter {
  private pending = 0;
  private tail: Promise<void> = Promise.resolve();
  private next = new Map<string, number>();
  constructor(private readonly now = () => Date.now(), private readonly sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))) {}
  async run<T>(key: string, interval: number, fn: () => Promise<T>, signal?: AbortSignal, deadline = Infinity): Promise<T> {
    if (this.pending >= 32) throw new AppError('busy', 'Too many requests. Try again shortly.');
    this.pending++;
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(r => { release = r; });
    await previous;
    try {
      if (signal?.aborted || this.now() >= deadline) throw new AppError('request_cancelled', 'Request cancelled before dispatch; no command was sent.');
      const delay = Math.max(0, (this.next.get(key) ?? 0) - this.now());
      if (delay) await this.sleep(delay);
      if (signal?.aborted || this.now() >= deadline) throw new AppError('request_cancelled', 'Request cancelled before dispatch; no command was sent.');
      this.next.set(key, this.now() + interval);
      return await fn();
    } finally { this.pending--; release(); }
  }
}

export class GoveeBackend implements Backend {
  readonly demo = false;
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch, private readonly limiter = new RequestLimiter(), private readonly timeoutMs = 10_000) {
    if (!apiKey || /[\r\n]/.test(apiKey)) throw new AppError('configuration_error', 'A valid server-side Govee API key is required.');
  }
  private async request(path: string, payload?: unknown, signal?: AbortSignal): Promise<z.infer<typeof envelopeSchema>> {
    let response: Response;
    try {
      response = await this.fetcher(`${BASE}${path}`, {
        method: payload === undefined ? 'GET' : 'POST',
        headers: { 'Govee-API-Key': this.apiKey, 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify({ requestId: randomUUID(), payload }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs), redirect: 'error',
      });
    } catch {
      throw new AppError('upstream_unavailable', 'Govee did not respond. The outcome of a control request may be unknown; check state before retrying.');
    }
    if (response.status === 429) {
      const header = response.headers.get('retry-after');
      const numeric = header === null ? NaN : Number(header);
      const seconds = Number.isFinite(numeric) ? numeric : Math.ceil((Date.parse(header ?? '') - Date.now()) / 1000);
      throw new AppError('rate_limited', 'Govee rate limit reached. Wait before trying again.', Number.isFinite(seconds) ? Math.max(1, Math.min(seconds, 86400)) : 60);
    }
    if (response.status === 401 || response.status === 403) throw new AppError('upstream_authentication_failed', 'Govee rejected the configured API key. Check it on the server; never paste it into chat.');
    if (!response.ok) throw new AppError('upstream_error', 'Govee returned an error. A control outcome may be unknown; check state before retrying.');
    let parsed: z.infer<typeof envelopeSchema>;
    try {
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      let bytes = 0; const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1_048_576) { await reader.cancel(); throw new Error(); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      parsed = envelopeSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    }
    catch { throw new AppError('invalid_upstream_response', 'Govee returned an unexpected response. A control outcome may be unknown.'); }
    if (parsed.code === 429) throw new AppError('rate_limited', 'Govee rate limit reached. Wait before trying again.', 60);
    if (parsed.code !== 200) throw new AppError('upstream_rejected', 'Govee rejected the request. Refresh devices and check supported capabilities.');
    return parsed;
  }
  async devices() {
    return this.limiter.run('devices', 2100, async () => {
      const data = (await this.request('/user/devices')).data;
      const result = z.array(deviceSchema).safeParse(data);
      if (!result.success) throw new AppError('invalid_upstream_response', 'Govee returned an unexpected device list.');
      return result.data;
    });
  }
  private async capabilities(path: string, device: Device) {
    return this.limiter.run(`${path}:${device.device}`, 2100, async () => {
      const data = (await this.request(path, { sku: device.sku, device: device.device })).payload;
      const result = capsSchema.safeParse(data);
      if (!result.success) throw new AppError('invalid_upstream_response', 'Govee returned unexpected capabilities.');
      return result.data.capabilities;
    });
  }
  state(device: Device) { return this.capabilities('/device/state', device); }
  scenes(device: Device) { return this.capabilities('/device/scenes', device); }
  async control(device: Device, command: Command, signal?: AbortSignal) {
    // Globally serialize writes at <2/sec, below both account and device limits.
    await this.limiter.run('control', 600, async () => {
      await this.request('/device/control', { sku: device.sku, device: device.device, capability: command }, signal);
    }, signal, Date.now() + 3000);
  }
}
