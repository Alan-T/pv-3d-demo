import { BRACE_JOINT } from './brace-connector-spec.ts';
import { MODULE_MOUNTING } from '../../config/engineering-rules.ts';

/** 标准外六角螺栓及配套件的建模尺寸，单位 mm。 */
export const BOLT_DIMENSIONS = {
  16: {
    washerRadius: 15, washerThickness: 3, acrossFlats: 24, nutHeight: 14.8, headHeight: 10,
    spring: { innerRadius: 8.1, outerRadius: 12.2, thickness: 4 },
  },
  12: {
    washerRadius: 12, washerThickness: 2.5, acrossFlats: 18, nutHeight: 10.8, headHeight: 7.5,
    spring: { innerRadius: 6.1, outerRadius: 9.2, thickness: 3.1 },
  },
  8: {
    washerRadius: 8, washerThickness: 1.6, acrossFlats: 13, nutHeight: 6.5, headHeight: 5.3,
    spring: { innerRadius: 4.1, outerRadius: 6.35, thickness: 2 },
  },
} as const;

export const M8_SOCKET_HEAD = { diameter: 13, height: 8, acrossFlats: 6, recessDepth: 4, chamfer: 0.6 } as const;
export const SERRATED_WASHER = { thickness: 0.6, radialClearance: 0.4 } as const;

export interface FastenerSpec {
  diameter: keyof typeof BOLT_DIMENSIONS;
  length: number;
  headWasher: boolean;
  spring: boolean;
  nutWasher?: { radius: number; thickness: number };
}

interface JointFastenerRule extends FastenerSpec {
  slot: { length: number; width: number; doubleSided: boolean } | null;
  includeBeamWeb: boolean;
  group: 'frame' | 'slope' | 'purlinTie';
}

const standardM12 = {
  diameter: 12, length: 35, headWasher: true, spring: true,
  slot: null, includeBeamWeb: false, group: 'frame',
} as const;
const braceSlot = { length: BRACE_JOINT.slotL, width: BRACE_JOINT.slotW, doubleSided: false };
// 组件安装螺栓和压块螺栓使用相同的垫圈组合。
const moduleWashers = {
  headWasher: true, spring: true, nutWasher: { radius: 12, thickness: 2 },
} as const;
/** 压块螺栓公称长度由组件厚度对应的压块规格提供。 */
export const CLAMP_FASTENER = { ...moduleWashers, diameter: 8 } as const;

/** 连接位置决定紧固件规格和长圆孔。夹紧厚度由被连接构件的实际板厚决定。 */
export const JOINT_FASTENER_RULES = {
  top: {
    ...standardM12, diameter: 16, length: 40, includeBeamWeb: true,
    slot: { length: 40, width: 18, doubleSided: true },
  },
  foot: { ...standardM12, slot: braceSlot },
  footBrace: { ...standardM12, slot: braceSlot },
  btop: { ...standardM12, includeBeamWeb: true },
  postTie: standardM12,
  purlinTie: { ...standardM12, group: 'purlinTie' },
  splice: { ...standardM12, group: 'slope' },
  clip: standardM12,
  clipWeb: standardM12,
  purlinBeam: standardM12,
  module: {
    ...moduleWashers, ...MODULE_MOUNTING.installationBolt,
    slot: null, includeBeamWeb: false, group: 'slope',
  },
} as const satisfies Record<string, JointFastenerRule>;

export type JointFastenerKind = keyof typeof JOINT_FASTENER_RULES;

export function fastenerLabel(kind: JointFastenerKind) {
  const { diameter, length } = JOINT_FASTENER_RULES[kind];
  return `M${diameter}×${length}`;
}
