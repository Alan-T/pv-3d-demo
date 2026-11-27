import type { MemberSections, ModelParameters } from './design-types.ts';
import { BRACE_JOINT, needsSplitBraceConnector } from './specs/brace-connector-spec.ts';
import { braceConnection, braceMember } from './brace-layout.ts';
import { cutPurlin } from './purlin-cut.ts';
import { FIX, SOLVE_RULES } from '../config/engineering-rules.ts';

const DEGREES_TO_RADIANS = Math.PI / 180;

/** 框架截面坐标以组件下沿的水平投影为 x 原点，以前柱地面为 y=0，长度为 mm。 */
function solveBeamAndPosts(parameters: ModelParameters, sections: MemberSections, firstHoleOffset: number) {
  const tilt = parameters.tilt * DEGREES_TO_RADIANS;
  const cosTilt = Math.cos(tilt), sinTilt = Math.sin(tilt);
  // 安装孔在组件上居中，斜梁取整后的余量平分到两端。
  const purlinSpan = (parameters.rows - 1) * (parameters.modL + FIX.modGap) + parameters.hole;
  const minimumBeamLength = purlinSpan + FIX.beamEndOffsets.low + FIX.beamEndOffsets.high;
  const { beamLengthStep } = SOLVE_RULES;
  const beamLength = Math.ceil(minimumBeamLength / beamLengthStep) * beamLengthStep;
  const endAllowance = (beamLength - minimumBeamLength) / 2;
  const overhang = (beamLength - parameters.span / cosTilt) / 2;
  const lowerExtension = firstHoleOffset - FIX.beamEndOffsets.low - endAllowance;
  const frontPostToModuleEdge = overhang + lowerExtension; // 沿斜梁方向量取
  const beamTopOffset = sections.beam.d / 2;
  const moduleBottomOffset = beamTopOffset + sections.purlin.d;
  const frontPostX = frontPostToModuleEdge * cosTilt + moduleBottomOffset * sinTilt;
  const rearPostX = frontPostX + parameters.span;
  const frontHoleHeight = parameters.h0 + frontPostToModuleEdge * sinTilt - moduleBottomOffset * cosTilt;
  const rearHoleHeight = frontHoleHeight + parameters.span * sinTilt / cosTilt;
  const frontPostTop = frontHoleHeight + FIX.postTopHole;
  const rearPostTop = rearHoleHeight + FIX.postTopHole;

  // 顺坡安装以平地作为另一侧基线，双向安装以反向坡作为另一侧基线。
  const slopeNS = parameters.slopeNS / 100;
  const groundHeightAt = (x: number) => slopeNS * (x - frontPostX);
  const rearGroundHeight = groundHeightAt(rearPostX);
  const oppositeRearGround = parameters.alongSlope ? 0 : -rearGroundHeight;
  const embedLevelR = Math.min(rearGroundHeight, oppositeRearGround);
  const pileGradeR = Math.max(rearGroundHeight, oppositeRearGround);
  const frontPostBottom = -parameters.embed, rearPostBottom = embedLevelR - parameters.embed;
  const along = (distanceFromBeamStart: number) => ({
    x: frontPostX + (distanceFromBeamStart - overhang) * cosTilt,
    y: frontHoleHeight + (distanceFromBeamStart - overhang) * sinTilt,
  });
  return {
    c: cosTilt, s: sinTilt, beamLen: beamLength, ovh: overhang, extLow: lowerExtension,
    hBeamTop: beamTopOffset, hModBot: moduleBottomOffset, xf: frontPostX, xr: rearPostX,
    nodeF: frontHoleHeight, nodeR: rearHoleHeight, topF: frontPostTop, topR: rearPostTop,
    holeF: frontHoleHeight, holeR: rearHoleHeight, botF: frontPostBottom, botR: rearPostBottom,
    lenF: frontPostTop - frontPostBottom, lenR: rearPostTop - rearPostBottom,
    along, sp: slopeNS, gy: groundHeightAt, gR: rearGroundHeight, embedLevelR, pileGradeR,
  };
}

function solveBraces(parameters: ModelParameters, sections: MemberSections, frame: ReturnType<typeof solveBeamAndPosts>, warnings: string[]) {
  const { beamLen: beamLength, xf: frontPostX, xr: rearPostX, along, ovh: overhang } = frame;
  const { braceTopMinSpacing, outerBracePostClearance } = SOLVE_RULES;
  let frontTopOffset = parameters.braceTopF, rearTopOffset = beamLength - parameters.braceTopR;
  if (rearTopOffset - frontTopOffset < braceTopMinSpacing) {
    frontTopOffset = beamLength / 2 - braceTopMinSpacing / 2;
    rearTopOffset = beamLength / 2 + braceTopMinSpacing / 2;
    warnings.push('立柱间距太小：两根斜撑的上节点会重叠，暂时移到斜梁中部');
  }
  // 同一榀的前后柱共用连接板规格，各自按柱宽定位安装孔。
  const connector = { outer: parameters.outer, split: needsSplitBraceConnector(parameters.outer, sections.postF.d, sections.postR.d) };
  const connections = [
    braceConnection({ ...connector, x: frontPostX, y: parameters.braceHF, side: 1, postWidth: sections.postF.d }),
    braceConnection({ ...connector, x: rearPostX, y: parameters.braceHR, side: -1, postWidth: sections.postR.d }),
  ];
  for (const joint of connections) {
    const front = joint.side > 0;
    const width = front ? sections.postF.d : sections.postR.d;
    if (joint.split && joint.plateShift + BRACE_JOINT.slotW / 2 > width / 2) {
      warnings.push(`${front ? '前' : '后'}立柱截面宽 ${width} mm，共用斜撑连接板分装时 Ø${BRACE_JOINT.slotW} 安装孔超出柱边，请调整立柱截面`);
    }
  }
  const frontBase = connections[0].Q, rearBase = connections[1].Q;
  const frontTop = along(frontTopOffset), rearTop = along(rearTopOffset);
  const braceMembers = [braceMember(frontBase, frontTop, FIX.braceEdge), braceMember(rearBase, rearTop, FIX.braceEdge)];

  // 外斜撑在立柱外侧与内斜撑共用连接板，上端连接到悬挑段。
  let outer = null;
  const frontOuterBase = connections[0].Qo, rearOuterBase = connections[1].Qo;
  if (frontOuterBase && rearOuterBase) {
    const maxEndOffset = overhang - outerBracePostClearance;
    const frontOffset = Math.min(parameters.braceOutF, maxEndOffset);
    const rearOffset = beamLength - Math.min(parameters.braceOutR, maxEndOffset);
    if (parameters.braceOutF > maxEndOffset || parameters.braceOutR > maxEndOffset) {
      warnings.push('外斜撑上节点要落在立柱外侧的斜梁悬挑段上，已临时压回悬挑段');
    }
    const frontOuterTop = along(frontOffset), rearOuterTop = along(rearOffset);
    outer = {
      oF: frontOuterBase, oR: rearOuterBase, toF: frontOffset, toR: rearOffset, toFp: frontOuterTop, toRp: rearOuterTop,
      braceOF: braceMember(frontOuterBase, frontOuterTop, FIX.braceEdge).len,
      braceOR: braceMember(rearOuterBase, rearOuterTop, FIX.braceEdge).len,
    };
  }

  return {
    tF: frontTopOffset, tR: rearTopOffset, bF: frontBase, bR: rearBase, tFp: frontTop, tRp: rearTop,
    braceF: braceMembers[0].len, braceR: braceMembers[1].len, outer, connections, braceMembers,
  };
}

export function solve(parameters: ModelParameters, sections: MemberSections) {
  const firstHoleOffset = (parameters.modL - parameters.hole) / 2;
  const frame = solveBeamAndPosts(parameters, sections, firstHoleOffset);
  const warnings: string[] = [];
  if (frame.ovh < SOLVE_RULES.warnings.minBeamOverhang) warnings.push(`立柱间距太大：斜梁两端悬挑只剩 ${Math.round(frame.ovh)}`);
  if (!parameters.outer && frame.ovh > SOLVE_RULES.warnings.suggestOuterBraceOverhang) warnings.push(`斜梁两端悬挑 ${Math.round(frame.ovh)}，比较长，建议加外斜撑或加大立柱间距`);
  const braces = solveBraces(parameters, sections, frame, warnings);

  const modStarts = Array.from({ length: parameters.rows }, (_, row) => -frame.extLow + row * (parameters.modL + FIX.modGap));
  const purlins = modStarts.flatMap(start => [start + firstHoleOffset, start + firstHoleOffset + parameters.hole]);
  const halfFlange = sections.purlin.f / 2;
  if (purlins[0] - halfFlange < 0 || purlins[purlins.length - 1] + halfFlange > frame.beamLen) {
    warnings.push(`檩条（按组件安装孔距 ${parameters.hole} 布置）超出了斜梁端部`);
  }
  const clearEdge = parameters.h0 - frame.gy(0);
  const clearBraceR = parameters.braceHR - frame.gR;
  if (clearBraceR < SOLVE_RULES.warnings.minRearBraceGroundClearance) warnings.push(`后斜撑下端离地只有 ${Math.round(clearBraceR)}`);
  if (clearEdge < SOLVE_RULES.warnings.minModuleEdgeGroundClearance) warnings.push(`组件前沿实际离地只有 ${Math.round(clearEdge)}`);

  return { sections, ...frame, ...braces, modStarts, purlins, clearEdge, clearBraceR, warn: warnings };
}

export function getPurlinDimensions({ cols, modW, fix }: Pick<ModelParameters, 'cols' | 'modW' | 'fix'>) {
  const pitchEW = modW + FIX.modGapEW;
  const arrW = cols * pitchEW - FIX.modGapEW;
  const purlinExt = FIX.purlinExt[fix];
  return { pitchEW, arrW, purlinExt, purlinLen: arrW + 2 * purlinExt };
}

// 逐榀增加支撑，直到两端悬挑满足要求。只有一跨时，首末跨是同一跨。
function placeFrames(purlinLen: number, flange: number, pitchEnd: number, pitch: number, warnings: string[]) {
  function spanOf(frames: number) {
    if (frames === 1) return 0;
    if (frames === 2) return pitchEnd;
    return 2 * pitchEnd + (frames - 3) * pitch;
  }
  const maxEndOverhang = SOLVE_RULES.ew.maxEndOverhangRatio * pitchEnd;
  let frames = 1;
  while ((purlinLen - spanOf(frames)) / 2 > maxEndOverhang) frames++;
  if (frames > 1 && spanOf(frames) > purlinLen - flange) {
    frames--;
    warnings.push(`组件列数太少：檩条两端悬挑 ${Math.round((purlinLen - spanOf(frames)) / 2)}，再加一榀又放不下`);
  }
  const bays = Array.from({ length: frames - 1 }, (_, i) => i === 0 || i === frames - 2 ? pitchEnd : pitch);
  const spanEW = spanOf(frames);
  const frameZPositions = [-spanEW / 2];
  for (const bayLength of bays) frameZPositions.push(frameZPositions[frameZPositions.length - 1] + bayLength);
  return { frames, bays, spanEW, zs: frameZPositions };
}

// 檩条-组件节点优先取最东一跨中离榀位最远的一道组件缝。只有一列时取阵列东边。
function selectModuleGap(cols: number, arrW: number, pitchEW: number, frameZPositions: number[]) {
  const gaps = [];
  for (let column = 1; column < cols; column++) gaps.push(-arrW / 2 + column * pitchEW - FIX.modGapEW / 2);
  const eastFrame = frameZPositions[frameZPositions.length - 1], westFrame = frameZPositions[frameZPositions.length - 2] ?? -Infinity;
  const inBay = gaps.filter(gap => gap > westFrame && gap < eastFrame);
  let selected = arrW / 2 + FIX.modGapEW / 2;
  let bestClearance = -Infinity;
  for (const gap of inBay.length ? inBay : gaps) {
    const clearance = Math.min(...frameZPositions.map(z => Math.abs(gap - z)));
    if (clearance > bestClearance) {
      bestClearance = clearance;
      selected = gap;
    }
  }
  return selected;
}

export function layoutEW(parameters: ModelParameters, sections: MemberSections) {
  const dimensions = getPurlinDimensions(parameters);
  const { purlinLen, arrW, pitchEW } = dimensions;
  const warnings: string[] = [];
  const frames = placeFrames(purlinLen, sections.purlin.f, parameters.pitchEnd, parameters.pitch, warnings);
  const gapZ = selectModuleGap(parameters.cols, arrW, pitchEW, frames.zs);
  // 东西坡度：上面东西向的 z 都是沿檩条（沿坡）量的，榀距 = 两榀之间的檩条长度。
  // 换成世界坐标时沿坡 z 处水平位置 z·cos、抬高 z·sin（阵列中心不动），见 ewMatrix
  const slopeEW = (parameters.slopeEW || 0) / 100;
  const cosSlope = 1 / Math.hypot(1, slopeEW);
  const ew = { i: slopeEW, ca: cosSlope, sa: slopeEW * cosSlope };
  const cuts = cutPurlin(parameters, purlinLen, frames.zs, arrW);
  if (!cuts.valid) {
    warnings.push(cuts.error ? `檩条自定义分段无效，暂显示通长檩条。${cuts.error}` : '檩条切割无可行解，请调整榀距或最大长度；暂显示通长檩条');
  }
  return { ...dimensions, ...frames, cols: parameters.cols, gapZ, ew, cuts, warn: warnings };
}

/**
 * 南北框架截面的求解结果。x 为南向北的水平距离，y 为相对前柱地面的标高（mm）。
 * along(t) 将从斜梁下端量取的轴向距离（mm）转换为截面坐标。c/s 为倾角的余弦/正弦，sp 为地面坡比。
 */
export type Solution = ReturnType<typeof solve>;
/**
 * 东西布置以阵列中心为原点。zs、gapZ、spanEW 和切割坐标均为沿檩条的距离（mm）。
 * ew.i 为坡比，沿坡距离乘 ew.ca 得水平距离，乘 ew.sa 得世界坐标的高度差。
 */
export type EWLayout = ReturnType<typeof layoutEW>;
