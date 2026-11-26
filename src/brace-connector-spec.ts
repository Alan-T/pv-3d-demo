import { BRACE_CONNECTOR_SPECS } from './config.ts';

/** 连接板详图尺寸（mm），坐标原点取立柱孔中心线与连接板水平中线的交点。 */
export const BRACE_JOINT = {
  boltPitch: 70,     // 立柱两孔的竖向间距
  boltU: 120,        // 斜撑孔至立柱孔中心线的水平距离
  rise: 30,          // 斜撑孔高出连接板水平中线的距离
  braceEdge: 35,     // 沿斜撑从孔心到端头的距离
  postTopHole: 50,   // 立柱上端螺栓孔心到柱顶的距离
  singleBack: 20,    // 单面板背边至立柱孔中心线的距离
  singleBot: 30,     // 单面板下边在斜撑侧伸过立柱孔中心线的距离
  doubleBottomHalf: 30, // 对称双面板下边的半宽
  chamferY: 5,       // 从该高度开始将板侧边斜切到下边
  slotW: 14, slotL: 28,
} as const;

/** 按宽*高*厚解析单块连接板，原规格名称用于保存与标注。 */
export function parseBraceConnectorSpec(name: string) {
  const dimensions = name.split('*');
  if (dimensions.length !== 3 || !dimensions.every(value => /^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0)) {
    throw new Error(`无效的斜撑连接板规格：${name}`);
  }
  const [width, height, thickness] = dimensions.map(Number);
  return { name, width, height, thickness };
}

export const braceConnectorPlates = {
  single: parseBraceConnectorSpec(BRACE_CONNECTOR_SPECS[0]),
  double: parseBraceConnectorSpec(BRACE_CONNECTOR_SPECS[1]),
};

/** 带外斜撑时，前后立柱按较宽的一侧共用板型。 */
export function needsSplitBraceConnector(outer: boolean | number, frontWidth: number, rearWidth = frontWidth) {
  return !!outer && Math.max(frontWidth, rearWidth) >= 140;
}

/** 分装时每侧使用一块单面板。 */
export function getBraceConnectorPlate(outer: boolean | number, split: boolean, plates = braceConnectorPlates) {
  return outer && !split ? plates.double : plates.single;
}
