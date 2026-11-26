import { EXTRA_LIMITS, PARAMETER_FIELDS } from './config.ts';
import { CLAMP_LENGTHS, MODULE_THICKNESSES } from './clamp-spec.ts';
import { P } from './model-parameters.ts';
import type { ModelParameters, ParameterDefinition, ParameterFieldConfig } from './design-types.ts';

const numericOptionLists = { clampLengths: CLAMP_LENGTHS };

function resolveField({ whenFix, ...field }: ParameterFieldConfig): ParameterDefinition {
  const when = whenFix && ((parameters: ModelParameters) => parameters.fix === whenFix);
  if (field.type !== 'select') return { ...field, when };
  if ('numericOptions' in field) return { ...field, when, numericOptions: numericOptionLists[field.numericOptions] };
  const options = field.options.map((option): [string, string] => typeof option === 'string' ? [option, option] : option);
  return { ...field, when, options };
}

export const PARAMS = PARAMETER_FIELDS.map(resolveField);

// 返回编辑范围与步长；安装孔距上限随当前组件长度变化。
export function limits(key: string): [number, number, number] {
  const field = PARAMS.find(item => item.key === key);
  if (field) {
    const step = key === 'tilt' || field.unit === '%' ? 0.1 : Math.min(field.step ?? 1, 1);
    return [field.min ?? -Infinity, field.max ?? Infinity, step];
  }
  if (key === 'modT') return [Math.min(...MODULE_THICKNESSES), Math.max(...MODULE_THICKNESSES), 1];
  const [min, max] = EXTRA_LIMITS[key];
  return [min, key === 'hole' ? Math.min(max, P.modL - 200) : max, 1];
}
