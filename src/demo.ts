import type { Backend, Capability, Command, Device } from './domain.js';

const numberCap = (type: string, instance: string, min: number, max: number): Capability => ({ type, instance, parameters: { dataType: 'INTEGER', range: { min, max, precision: 1 } } });
export const demoDevice: Device = {
  sku: 'DEMO-LIGHT', device: 'demo-outdoor-light', deviceName: 'Demo house lights', type: 'devices.types.light',
  capabilities: [
    { type: 'devices.capabilities.on_off', instance: 'powerSwitch', parameters: { dataType: 'ENUM', options: [{ name: 'on', value: 1 }, { name: 'off', value: 0 }] } },
    numberCap('devices.capabilities.range', 'brightness', 1, 100),
    numberCap('devices.capabilities.color_setting', 'colorRgb', 0, 16777215),
    numberCap('devices.capabilities.color_setting', 'colorTemperatureK', 2000, 9000),
    { type: 'devices.capabilities.dynamic_scene', instance: 'lightScene' },
  ],
};
export class DemoBackend implements Backend {
  readonly demo = true;
  private values = new Map<string, unknown>([['powerSwitch', 0], ['brightness', 50], ['colorRgb', 16777215], ['colorTemperatureK', 3000]]);
  async devices() { return structuredClone([demoDevice]); }
  async state() {
    return [
      { type: 'devices.capabilities.online', instance: 'online', state: { value: true } },
      ...demoDevice.capabilities.filter(c => this.values.has(c.instance)).map(c => ({ type: c.type, instance: c.instance, state: { value: this.values.get(c.instance) } })),
    ];
  }
  async scenes(): Promise<Capability[]> {
    return [{ type: 'devices.capabilities.dynamic_scene', instance: 'lightScene', parameters: { dataType: 'ENUM', options: [
      { name: 'Warm welcome (demo)', value: { id: 1, paramId: 100 } },
      { name: 'Holiday sparkle (demo)', value: { id: 2, paramId: 100 } },
    ] } }];
  }
  async control(_device: Device, command: Command, signal?: AbortSignal) { signal?.throwIfAborted(); this.values.set(command.instance, command.value); }
}
