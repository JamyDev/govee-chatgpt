import { createHash } from 'node:crypto';
import { z } from 'zod';

export const capabilitySchema = z.object({
  type: z.string(), instance: z.string(),
  parameters: z.object({
    dataType: z.string().optional(),
    range: z.object({ min: z.number(), max: z.number(), precision: z.number().optional() }).optional(),
    options: z.array(z.object({ name: z.string(), value: z.unknown() })).optional(),
  }).passthrough().optional(),
  state: z.object({ value: z.unknown() }).optional(),
});
export const deviceSchema = z.object({
  sku: z.string().min(1), device: z.string().min(1), deviceName: z.string(),
  type: z.string(), capabilities: z.array(capabilitySchema),
});
export type Capability = z.infer<typeof capabilitySchema>;
export type Device = z.infer<typeof deviceSchema>;
export type Command = { type: string; instance: string; value: unknown };
export interface Backend {
  readonly demo: boolean;
  devices(): Promise<Device[]>;
  state(device: Device): Promise<Capability[]>;
  scenes(device: Device): Promise<Capability[]>;
  control(device: Device, command: Command, signal?: AbortSignal): Promise<void>;
}
export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryAfterSeconds?: number) {
    super(message); this.name = 'AppError';
  }
}
export function publicId(sku: string, device: string): string {
  return `light_${createHash('sha256').update(JSON.stringify([sku, device])).digest('hex').slice(0, 20)}`;
}
export const supported = {
  power: ['devices.capabilities.on_off', 'powerSwitch'],
  brightness: ['devices.capabilities.range', 'brightness'],
  rgb: ['devices.capabilities.color_setting', 'colorRgb'],
  temperature: ['devices.capabilities.color_setting', 'colorTemperatureK'],
} as const;
export const sceneTypes = new Set(['devices.capabilities.dynamic_scene', 'devices.capabilities.mode']);
export function isScene(cap: Capability): boolean {
  return sceneTypes.has(cap.type) && ['lightScene'].includes(cap.instance);
}
export function errorResult(error: unknown) {
  const safe = error instanceof AppError ? error : new AppError('internal_error', 'The request could not be completed. Check server configuration.');
  return { isError: true as const, content: [{ type: 'text' as const, text: JSON.stringify({ error: safe.code, message: safe.message, ...(safe.retryAfterSeconds !== undefined ? { retryAfterSeconds: safe.retryAfterSeconds } : {}) }) }] };
}
