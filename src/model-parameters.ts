import { DEFAULTS, DISPLAY_DEFAULTS, PURLIN_ACCESSORY_KEYS } from './config.ts';
import type { DrawingPreset, LayoutPreset, ModelParameters, PurlinAccessory } from './design-types.ts';

export function getLayoutParameters({ id, label, quantity, sections, materials, ...parameters }:
  LayoutPreset & { id?: string; label?: string } & Partial<Record<PurlinAccessory, string>>) {
  for (const key of PURLIN_ACCESSORY_KEYS) {
    if (sections && Object.hasOwn(sections, key)) parameters[key] = sections[key];
  }
  return parameters as Omit<LayoutPreset, 'quantity' | 'sections' | 'materials'> & Record<PurlinAccessory, string>;
}

// 三维模型使用图纸共用参数和当前排布参数的独立副本。
export function getPresetParameters({ projectInfo, layouts, ...sharedParameters }: DrawingPreset, layout = layouts[0]): ModelParameters {
  return structuredClone({ ...sharedParameters, ...getLayoutParameters(layout) });
}

export const P = getPresetParameters(DEFAULTS);
export const show = { ...DISPLAY_DEFAULTS };
