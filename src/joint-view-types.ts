import type { Matrix4 } from 'three';

export type ViewName = '3d' | 'side' | 'front' | 'top' | 'normal' | 'joint-elev' | 'joint-iso';
export type TieJointType = 'postTie' | 'purlinTie';
type PlanarJointType = 'foot' | 'top' | 'btop' | 'clip' | 'mod' | 'side' | 'splice';
export type JointType = PlanarJointType | TieJointType;

type Leader = [x: number, y: number, labelY: number, text: string, z?: number, elevationTip?: [number, number, number]];
interface JointAnnotations {
  anchorX: number;
  labelSide: number;
  z?: number;
  zl?: number;
  leaders: Leader[];
  lines: [number, number, number, number, number?][];
  dims?: [number, number, number, number, number, number, string][];
}
export interface PlanarJointSpec extends JointAnnotations {
  box: [number, number, number, number];
  at?: { x: number; y: number };
  matrix?: undefined;
}
export interface TieJointSpec extends JointAnnotations {
  matrix: Matrix4;
  clipBox: [number, number, number, number, number, number];
  isoDirection: [number, number, number];
  bay: number;
  endAllowance: number;
}
export type JointSpecs = Record<PlanarJointType, PlanarJointSpec[]> & Record<TieJointType, (TieJointSpec | null)[]>;
