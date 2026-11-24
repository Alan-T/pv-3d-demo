import type * as THREE from 'three';
import type { ModelParameters } from './design-types.ts';
import type { EWLayout, Solution } from './solve.ts';
import type { getPurlinClipSpec } from './purlin-clip-spec.ts';
import type { getPurlinConnectorSpec } from './purlin-connector-spec.ts';
import type { calculatePurlinTies } from './purlin-tie-layout.ts';
import type { calculatePostTies } from './post-tie-layout.ts';
import type { createPartOptions } from './part-options.ts';
import type { BoltsPart } from './parts/bolts.ts';

export type PartOptions = ReturnType<typeof createPartOptions>;
export type ClipSpec = NonNullable<ReturnType<typeof getPurlinClipSpec>>;
export type ConnectorSpec = NonNullable<ReturnType<typeof getPurlinConnectorSpec>>;
export type PurlinTies = ReturnType<typeof calculatePurlinTies>;
export type PostTieRow = ReturnType<typeof calculatePostTies>[number];
export type BoltCollector = ReturnType<BoltsPart['collector']>;

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
  u: THREE.Vector3;
  n: THREE.Vector3;
  zw: number;
  zBeamWeb: number;
}
