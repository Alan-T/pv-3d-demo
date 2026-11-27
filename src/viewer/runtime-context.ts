import type * as THREE from 'three';
import { DEFAULTS } from '../config/presets.ts';
import { DISPLAY_DEFAULTS } from '../config/parameter-schema.ts';
import { getPresetParameters } from '../domain/model-parameters.ts';
import type { createTieJointFocus } from './tie-joint-focus.ts';
import type { createBracket } from '../model/bracket.ts';
import type { PresetId } from '../domain/design-types.ts';
import type { JointType, ViewName } from '../model/joint-view-types.ts';
import type { Solution } from '../domain/solve.ts';

type Bracket = ReturnType<typeof createBracket>;
type DimensionGroups = Record<'root' | 'key' | 'side' | 'deep' | 'ew' | 'normal' | 'joint' | 'topCuts', THREE.Group>;
export interface RuntimeState {
  preset: PresetId;
  view: ViewName;
  jointType: JointType;
  jointSel: number;
  labelK: number;
  S: Solution | null;
  layout: Bracket['layout'] | null;
  groups: (Bracket['groups'] & { ground: THREE.Mesh; tieFocus?: ReturnType<typeof createTieJointFocus>; tieCapCache?: Map<string, THREE.Group> }) | null;
  dims: DimensionGroups | null;
}
type Disposable = { dispose(): void };

/** 一个设计器拥有自己的参数、模型状态及每次重建时需要释放的资源。 */
export function createRuntimeContext() {
  const disposables: Disposable[] = [];
  const labels: THREE.Sprite[] = [];
  const state: RuntimeState = {
    preset: 'A', view: '3d', jointType: 'foot', jointSel: 1, labelK: 1.25,
    S: null, layout: null, groups: null, dims: null,
  };

  function track<T extends Disposable>(first: T, ...rest: Disposable[]): T {
    disposables.push(first, ...rest);
    return first;
  }

  function getBuiltState() {
    if (!state.S || !state.layout || !state.groups) throw new Error('模型尚未构建');
    return state as RuntimeState & {
      S: Solution; layout: Bracket['layout']; groups: NonNullable<RuntimeState['groups']>;
    };
  }

  return { parameters: getPresetParameters(DEFAULTS), display: { ...DISPLAY_DEFAULTS }, state, labels, disposables, track, getBuiltState };
}

export type RuntimeContext = ReturnType<typeof createRuntimeContext>;
