import { MODULE_MOUNTING } from '../config/engineering-rules.ts';
import { EXTRA_LIMITS, PARAMETER_FIELDS } from '../config/parameter-schema.ts';
import { CLAMP_LENGTHS, MODULE_THICKNESSES } from './specs/clamp-spec.ts';
import type { ModelParameters, ParameterDefinition, ParameterFieldConfig } from './design-types.ts';

const numericOptionLists = { clampLengths: CLAMP_LENGTHS };

function resolveField({ whenFix, ...field }: ParameterFieldConfig): ParameterDefinition {
  const when = whenFix && ((parameters: ModelParameters) => parameters.fix === whenFix);
  if (field.type !== 'select') return { ...field, when };
  if ('numericOptions' in field) {
    const options = field.numericOptions;
    return { ...field, when, numericOptions: typeof options === 'string' ? numericOptionLists[options] : options };
  }
  const options = field.options.map((option): [string, string] => typeof option === 'string' ? [option, option] : option);
  return { ...field, when, options };
}

export const PARAMS = PARAMETER_FIELDS.map(resolveField);

export function findParameterField<K extends string>(key: K) {
  return PARAMS.find((field): field is ParameterDefinition & { key: K } => field.key === key);
}

// 返回编辑范围与步长；安装孔距上限随当前组件长度变化。
export function limits(key: string, parameters: Pick<ModelParameters, 'modL'>): [number, number, number] {
  const field = findParameterField(key);
  if (field) {
    if ('numericOptions' in field) return [Math.min(...field.numericOptions), Math.max(...field.numericOptions), 1];
    const step = key === 'tilt' || field.unit === '%' ? 0.1 : Math.min(field.step ?? 1, 1);
    return [field.min ?? -Infinity, field.max ?? Infinity, step];
  }
  if (key === 'modT') return [Math.min(...MODULE_THICKNESSES), Math.max(...MODULE_THICKNESSES), 1];
  const [min, max] = EXTRA_LIMITS[key];
  return [min, key === 'hole' ? Math.min(max, parameters.modL - MODULE_MOUNTING.holeLengthAllowance) : max, 1];
}
