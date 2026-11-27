import type { Matrix4 } from 'three';

export type ViewName = '3d' | 'side' | 'front' | 'top' | 'normal' | 'joint-elev' | 'joint-iso';
export type TieJointType = 'postTie' | 'purlinTie';
type PlanarJointType = 'foot' | 'top' | 'btop' | 'clip' | 'mod' | 'side' | 'splice';
export type JointType = PlanarJointType | TieJointType;

/** 引线起点和标签标高均以 mm 表示；elevationTip 是正视图专用的三维起点。 */
type Leader = [x: number, y: number, labelY: number, text: string, z?: number, elevationTip?: [number, number, number]];
/** 普通节点在榀平面标注，拉杆节点在自身局部 XY 平面标注；坐标和标注偏移均为 mm。 */
interface JointAnnotations {
  anchorX: number;
  /** 引线文字在左侧取 -1，在右侧取 1。 */
  labelSide: number;
  z?: number;
  zl?: number;
  leaders: Leader[];
  lines: [number, number, number, number, number?][];
  dims?: [number, number, number, number, number, number, string][];
}
export interface PlanarJointSpec extends JointAnnotations {
  /** 榀平面内的取景边界（mm），x1、x2 顺序随标注侧改变。 */
  box: [x1: number, x2: number, y1: number, y2: number];
  at?: { x: number; y: number };
  matrix?: undefined;
}
export interface TieJointSpec extends JointAnnotations {
  /** 从拉杆节点的局部坐标（m）变换到世界坐标（m）。 */
  matrix: Matrix4;
  /** 裁切范围，以矩阵变换前的局部 mm 表示。 */
  clipBox: [xMin: number, xMax: number, yMin: number, yMax: number, zMin: number, zMax: number];
  isoDirection: [number, number, number];
  bay: number;
  /** 端孔中心至杆端的距离（mm）。 */
  endAllowance: number;
}
/** 各节点按前侧、后侧索引；无拉杆的安装位置保留 null。 */
export type JointSpecs = Record<PlanarJointType, PlanarJointSpec[]> & Record<TieJointType, (TieJointSpec | null)[]>;
