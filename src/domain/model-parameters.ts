import { PURLIN_ACCESSORY_KEYS } from '../config/catalogs.ts';
import type { DrawingPreset, LayoutPreset, ModelParameters, ProjectInfo, PurlinAccessory } from './design-types.ts';

// 项目信息表单和三维模型分别读取当前图纸的默认值。
export function splitDrawingPreset(preset: DrawingPreset) {
  const {
    number, version, name, customer, productType, tradeTerm, country, longitude, latitude,
    designStandard, designMethod, terrainCategory, buildingCategory, windSpeed, snowPressure,
    elevation, airDensity, designLife, corrosivityCategory, layouts, ...sharedParameters
  } = preset;
  const projectInfo: ProjectInfo = {
    number, version, name, customer, productType, tradeTerm, country, longitude, latitude,
    designStandard, designMethod, terrainCategory, buildingCategory, windSpeed, snowPressure,
    elevation, airDensity, designLife, corrosivityCategory,
  };
  return { projectInfo, sharedParameters, layouts };
}

export function getLayoutParameters({ id, label, quantity, sections, materials, ...parameters }:
  LayoutPreset & { id?: string; label?: string } & Partial<Record<PurlinAccessory, string>>) {
  for (const key of PURLIN_ACCESSORY_KEYS) {
    if (sections && Object.hasOwn(sections, key)) parameters[key] = sections[key];
  }
  return parameters as Omit<LayoutPreset, 'quantity' | 'sections' | 'materials'> & Record<PurlinAccessory, string>;
}

// 三维模型使用图纸共用参数和当前排布参数的独立副本。
export function getPresetParameters(preset: DrawingPreset, layout = preset.layouts[0]): ModelParameters {
  const { sharedParameters } = splitDrawingPreset(preset);
  return structuredClone({ ...sharedParameters, ...getLayoutParameters(layout) });
}
