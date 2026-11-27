/** 构件尺寸和安装边距，单位 mm。 */
export const FIX = {
  concretePile: { diameterAllowance: 100, endAllowance: 50 }, // mm：桩径比柱截面较大边增加 100，桩顶和桩底各延伸 50
  beamEndOffsets: { low: 135, high: 85 }, // 首末孔到梁端的基础距离（沿梁）；长度取整余量再平分两端
  braceEdge: 35, // 沿斜撑轴线，首末孔中心到各自端头的距离（mm）
  postTieEdge: 135, // 立柱拉杆端孔中心到杆端的基础距离（mm），前后排共用
  purlinTieEdge: 85, // 檩条拉杆首末孔中心到各自杆端的基础距离（mm）
  postTopHole: 50, // 前后立柱与斜梁连接的安装孔中心到柱顶的竖向距离（mm）
  modGap: 20, modGapEW: 20,   // 组件间隙固定 20（沿坡、东西向）
  // 檩条伸出组件阵列边：螺栓固定两端各 50（檩条图：32392 = 28 列组件 32292 + 2×50），压块固定各 100（放边压块）
  purlinExt: { bolt: 50, clamp: 100 },
};

/** 框架断面求解。长度与告警阈值为 mm，端悬挑系数为比例。 */
export const SOLVE_RULES = {
  beamLengthStep: 10,
  braceTopMinSpacing: 150,
  outerBracePostClearance: 100,
  warnings: {
    minBeamOverhang: 150,
    suggestOuterBraceOverhang: 1000,
    minRearBraceGroundClearance: 100,
    minModuleEdgeGroundClearance: 300,
  },
  ew: { maxEndOverhangRatio: 0.4 },
};

export const PURLIN_CUT_RULES = {
  gap: 4, // 段间净缝（mm）
  step: 50, // 接头位置搜索步长（mm）
  lengthStep: 100, // 初始均分段长的取整模数（mm）
  minFrameDistance: 300,
  maxFrameDistance: 1000,
  fixtureClearance: 300,
  maxAdjustAttempts: 400,
  maxRecalcAttempts: 5,
};

export const TIE_RULES = {
  postTie: {
    strutClearance: 200, // 斜撑节点至拉杆可用区间的预留高度（mm）
    minTopOffset: 150, maxTopOffset: 300, targetTopOffset: 225,
    holeRiseStep: 100, // 上下孔的高差模数；最小可用高度为最小顶距加一个模数
    minEdgeClearance: 50, // 孔到柱顶及地面的最小距离（mm）
    lengthStep: 10, levelLengthTolerance: 100, // 下料取整模数、共用平地料长的容差（mm）
  },
  purlinTie: { holeRadius: 7 }, // Ø14 通孔（mm）
};

export const MODULE_MOUNTING = {
  installationBolt: { diameter: 8, length: 22 }, // 安装孔固定的外六角螺栓（mm）
  holeLengthAllowance: 200, // 组件长度与安装孔距的最小差值（mm）
  boltEdgeInset: 18, // 安装孔中心距组件边缘（mm）
  frameFlangeThickness: 2, // 组件边框翼缘厚度（mm）
} as const;

/** 节点剖切与取景尺寸均为 mm；带 Px 的留白以屏幕像素计。 */
export const JOINT_VIEW_CONFIG = {
  section: {
    below: 400,
    above: 300,
    gap: 100,
    end: 100,
    clip: 150,
    defaultConnectorLength: 240,
    spliceMargin: 60,
  },
  spliceHalfDepth: 180,
  clampWidth: 200,
  clampHeight: 180,
  horizontalMarginPx: 40,
  verticalMarginPx: 190,
} as const;
