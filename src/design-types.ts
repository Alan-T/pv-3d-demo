export type PresetId = 'A' | 'B';
export type ToggleValue = boolean | 0 | 1;
export type MemberKey = 'postF' | 'postR' | 'beam' | 'purlin' | 'braceF' | 'braceR'
  | 'braceOF' | 'braceOR' | 'postTie' | 'purlinTie';
export type PurlinAccessory = 'purlinClip' | 'purlinConnector';
export type MaterialKey = MemberKey | PurlinAccessory | 'braceConnector';
export type ChannelSection = { type?: 'C'; d: number; f: number; l: number; t: number };
export type AngleSection = { type: 'L'; d: number; f: number; t: number; l?: never };
export type Section = ChannelSection | AngleSection;
export type NamedSection = Section & { name: string };

export interface ProjectInfo {
  number: string; version: string; name: string; customer: string; productType: string;
  tradeTerm: string; country: string; longitude: number; latitude: number;
  designStandard: string; designMethod: string; terrainCategory: string; buildingCategory: string;
  windSpeed: number; snowPressure: number; elevation: number; airDensity: number; designLife: number;
}

export interface SharedParameters {
  modL: number; modW: number; modT: number; modPower: number; modWeight: number;
  hole: number; rows: number; fix: 'bolt' | 'clamp'; serratedWasher: ToggleValue; clampL: number;
  tilt: number; h0: number; span: number; embed: number; slopeNS: number; slopeEW: number;
  maxPurlin: number | string; outer: ToggleValue;
  braceHF: number; braceHR: number; braceTopF: number; braceTopR: number;
  braceOutF: number; braceOutR: number;
}

export interface LayoutSettings {
  cols: number; pitchEnd: number; pitch: number;
  purlinCutMode: 'auto' | 'custom'; purlinCutLengths: number[];
  postTieF: string; postTieR: string; postTieSpansF: number[]; postTieSpansR: number[];
  purlinTies: string; purlinTieSpans: number[];
}
export interface LayoutPreset extends LayoutSettings {
  quantity: number;
  sections: Record<MaterialKey, string>;
  materials: Record<MaterialKey, string>;
}
export interface DrawingPreset extends SharedParameters {
  projectInfo: ProjectInfo;
  layouts: LayoutPreset[];
}
export type ModelParameters = SharedParameters & LayoutSettings & Record<PurlinAccessory, string>;
export type ParameterKey = keyof ModelParameters;
export type NumericParameterKey = { [K in ParameterKey]: ModelParameters[K] extends number ? K : never }[ParameterKey];
interface FieldBase {
  label: string; hint?: string; unit?: string; min?: number; max?: number; step?: number;
  when?: (parameters: ModelParameters) => boolean;
}
export type ParameterDefinition = FieldBase & (
  | { type: 'size'; keys: ['modL', 'modW', 'modT']; key?: never }
  | { type: 'select'; key: ParameterKey; options: [string, string][]; keys?: never }
  | { type: 'bool'; key: 'serratedWasher' | 'outer'; keys?: never }
  | { type?: 'number'; key: NumericParameterKey; keys?: never }
);
