import type * as THREE from 'three';
import type { ModelParameters } from '../domain/design-types.ts';
import type { EWLayout, Solution } from '../domain/solve.ts';
import type { getPurlinClipSpec } from '../domain/specs/purlin-clip-spec.ts';
import type { getPurlinConnectorSpec } from '../domain/specs/purlin-connector-spec.ts';
import type { calculatePurlinTies } from '../domain/purlin-tie-layout.ts';
import type { calculatePostTies } from '../domain/post-tie-layout.ts';
import type { createPartOptions } from './part-options.ts';
import type { BoltsPart } from './parts/bolts.ts';

export type PartOptions = ReturnType<typeof createPartOptions>;
export type ClipSpec = NonNullable<ReturnType<typeof getPurlinClipSpec>>;
export type ConnectorSpec = NonNullable<ReturnType<typeof getPurlinConnectorSpec>>;
export type PurlinTies = ReturnType<typeof calculatePurlinTies>;
export type PostTieRow = ReturnType<typeof calculatePostTies>[number];
export type BoltCollector = ReturnType<BoltsPart['collector']>;

/** 榀平面采用 x 向北、y 向上，z 向东。求解尺寸用 mm，Three.js 分组内的坐标用 m。 */
export interface BuildContext {
  P: ModelParameters;
  S: Solution;
  layout: EWLayout & { purlinTies: PurlinTies };
  bolts: BoltCollector;
  model: THREE.Group;
  buried: THREE.Group;
  modules: THREE.Group;
  slope: THREE.Group;
  hw: THREE.Group;
  hwSlope: THREE.Group;
  /** 沿斜梁由低向高的单位向量，位于榀的 x-y 平面。 */
  u: THREE.Vector3;
  /** 该平面内垂直斜梁向上的单位向量。 */
  n: THREE.Vector3;
  /** 立柱腹板相对榀位沿 +z 的偏移（mm）。 */
  zw: number;
  /** 斜梁腹板内表面相对榀位沿 +z 的偏移（mm）。 */
  zBeamWeb: number;
}
