import type { MemberSections, ModelParameters } from './design-types.ts';
import { BRACE_JOINT, needsSplitBraceConnector } from './brace-connector-spec.ts';
import { braceConnection, braceMember } from './brace-layout.ts';
import { cutPurlin } from './purlin-cut.ts';
import { FIX } from './config.ts';
import { DEG } from './core.ts';

/* 几何求解：由参数算出框架平面内的关键点和东西向布置，单位 mm。纯计算，不碰 three.js 场景 */

// 由组件下沿和安装孔定位斜梁，再用地面标高确定前后立柱的两端。
function solveBeamAndPosts(p: ModelParameters, sections: MemberSections, firstHoleOffset: number) {
  const tilt = p.tilt * DEG;
  const c = Math.cos(tilt), s = Math.sin(tilt);
  // 安装孔在每块组件上居中；首末孔距加下端 135、上端 85 后向上取整到 10。
  // 与二维一致：取整增加的长度平均分到上下两端。
  const purlinSpan = (p.rows - 1) * (p.modL + FIX.modGap) + p.hole;
  const minimumBeamLength = purlinSpan + FIX.beamEndOffsets.low + FIX.beamEndOffsets.high;
  const beamLen = Math.ceil(minimumBeamLength / 10) * 10;
  const endAllowance = (beamLen - minimumBeamLength) / 2;
  const ovh = (beamLen - p.span / c) / 2;                   // 斜梁两端伸出立柱中心（悬挑）
  const extLow = firstHoleOffset - FIX.beamEndOffsets.low - endAllowance;
  const sLow = ovh + extLow;                                // 前柱节点 → 组件下沿（沿坡）
  const hBeamTop = sections.beam.d / 2;                     // 斜梁中心线 → 上表面
  const hModBot = hBeamTop + sections.purlin.d;             // 斜梁中心线 → 组件底面
  const xf = sLow * c + hModBot * s;                        // 前柱中心到原点
  const xr = xf + p.span;
  const nodeF = p.h0 + sLow * s - hModBot * c;              // 斜梁中心线在前柱中心处的高度
  const nodeR = nodeF + p.span * s / c;
  // 连接孔位于立柱中心线与斜梁腹板中心线的交点；柱顶水平切，孔心向上留边。
  const holeF = nodeF, holeR = nodeR;
  const topF = holeF + FIX.postTopHole, topR = holeR + FIX.postTopHole;
  // 地面过前柱 ±0。后柱的设计范围取输入坡向与另一端标高：顺坡安装取平地，双向安装取反向坡。
  const sp = p.slopeNS / 100;
  const gy = (x: number) => sp * (x - xf);
  const gR = gy(xr);
  const otherGroundR = p.alongSlope ? 0 : -gR;
  const embedLevelR = Math.min(gR, otherGroundR);
  const pileGradeR = Math.max(gR, otherGroundR);
  const botF = -p.embed, botR = embedLevelR - p.embed;
  const along = (t: number) => ({ x: xf + (t - ovh) * c, y: nodeF + (t - ovh) * s }); // t：距斜梁下端
  return {
    c, s, beamLen, ovh, extLow, hBeamTop, hModBot, xf, xr, nodeF, nodeR, topF, topR, holeF, holeR,
    botF, botR, lenF: topF - botF, lenR: topR - botR, along, sp, gy, gR, embedLevelR, pileGradeR,
  };
}

function solveBraces(p: ModelParameters, sections: MemberSections, frame: ReturnType<typeof solveBeamAndPosts>, warn: string[]) {
  const { beamLen, xf, xr, along, ovh } = frame;
  let tF = p.braceTopF, tR = beamLen - p.braceTopR;
  if (tR - tF < 150) {
    tF = beamLen / 2 - 75; tR = beamLen / 2 + 75;
    warn.push('立柱间距太小：两根斜撑的上节点会重叠，暂时移到斜梁中部');
  }
  // 板型按同一榀的前、后柱共同选定；安装孔的横向位置按各自柱宽计算。
  const connector = { outer: p.outer, split: needsSplitBraceConnector(p.outer, sections.postF.d, sections.postR.d) };
  const connections = [
    braceConnection({ ...connector, x: xf, y: p.braceHF, side: 1, postWidth: sections.postF.d }),
    braceConnection({ ...connector, x: xr, y: p.braceHR, side: -1, postWidth: sections.postR.d }),
  ];
  for (const joint of connections) {
    const front = joint.side > 0;
    const width = front ? sections.postF.d : sections.postR.d;
    if (joint.split && joint.plateShift + BRACE_JOINT.slotW / 2 > width / 2) {
      warn.push(`${front ? '前' : '后'}立柱截面宽 ${width} mm，共用斜撑连接板分装时 Ø${BRACE_JOINT.slotW} 安装孔超出柱边，请调整立柱截面`);
    }
  }
  const bF = connections[0].Q, bR = connections[1].Q;
  const tFp = along(tF), tRp = along(tR);
  const braceMembers = [braceMember(bF, tFp, FIX.braceEdge), braceMember(bR, tRp, FIX.braceEdge)];
  const braceF = braceMembers[0].len, braceR = braceMembers[1].len;

  // 外斜撑：下节点在立柱外侧面（与内斜撑同高、同一块连接板），上节点在斜梁悬挑段
  let outer = null;
  if (connections[0].Qo && connections[1].Qo) {
    const oF = connections[0].Qo, oR = connections[1].Qo;
    const toF = Math.min(p.braceOutF, ovh - 100), toR = beamLen - Math.min(p.braceOutR, ovh - 100);
    if (p.braceOutF > ovh - 100 || p.braceOutR > ovh - 100) warn.push('外斜撑上节点要落在立柱外侧的斜梁悬挑段上，已临时压回悬挑段');
    const toFp = along(toF), toRp = along(toR);
    outer = {
      oF, oR, toF, toR, toFp, toRp,
      braceOF: braceMember(oF, toFp, FIX.braceEdge).len, braceOR: braceMember(oR, toRp, FIX.braceEdge).len,
    };
  }

  return { tF, tR, bF, bR, tFp, tRp, braceF, braceR, outer, connections, braceMembers };
}

export function solve(p: ModelParameters, sections: MemberSections) {
  const firstHoleOffset = (p.modL - p.hole) / 2;
  const frame = solveBeamAndPosts(p, sections, firstHoleOffset);
  const warn: string[] = [];
  if (frame.ovh < 150) warn.push(`立柱间距太大：斜梁两端悬挑只剩 ${Math.round(frame.ovh)}`);
  if (!p.outer && frame.ovh > 1000) warn.push(`斜梁两端悬挑 ${Math.round(frame.ovh)}，比较长，建议加外斜撑或加大立柱间距`);
  const braces = solveBraces(p, sections, frame, warn);

  const modStarts = Array.from({ length: p.rows }, (_, row) => -frame.extLow + row * (p.modL + FIX.modGap));
  const purlins = modStarts.flatMap(start => [start + firstHoleOffset, start + firstHoleOffset + p.hole]);
  const halfFlange = sections.purlin.f / 2;
  if (purlins[0] - halfFlange < 0 || purlins[purlins.length - 1] + halfFlange > frame.beamLen) {
    warn.push(`檩条（按组件安装孔距 ${p.hole} 布置）超出了斜梁端部`);
  }
  const clearEdge = p.h0 - frame.gy(0);
  const clearBraceR = p.braceHR - frame.gR;
  if (clearBraceR < 100) warn.push(`后斜撑下端离地只有 ${Math.round(clearBraceR)}`);
  if (clearEdge < 300) warn.push(`组件前沿实际离地只有 ${Math.round(clearEdge)}`);

  return { sections, ...frame, ...braces, modStarts, purlins, clearEdge, clearBraceR, warn };
}

export function getPurlinDimensions({ cols, modW, fix }: Pick<ModelParameters, 'cols' | 'modW' | 'fix'>) {
  const pitchEW = modW + FIX.modGapEW;
  const arrW = cols * pitchEW - FIX.modGapEW;
  const purlinExt = FIX.purlinExt[fix];
  return { pitchEW, arrW, purlinExt, purlinLen: arrW + 2 * purlinExt };
}

// 逐榀增加支撑，直到两端悬挑满足要求。只有一跨时，首末跨是同一跨。
function placeFrames(purlinLen: number, flange: number, pitchEnd: number, pitch: number, warn: string[]) {
  function spanOf(frames: number) {
    if (frames === 1) return 0;
    if (frames === 2) return pitchEnd;
    return 2 * pitchEnd + (frames - 3) * pitch;
  }
  const maxEndOverhang = 0.4 * pitchEnd;
  let frames = 1;
  while ((purlinLen - spanOf(frames)) / 2 > maxEndOverhang) frames++;
  if (frames > 1 && spanOf(frames) > purlinLen - flange) {
    frames--;
    warn.push(`组件列数太少：檩条两端悬挑 ${Math.round((purlinLen - spanOf(frames)) / 2)}，再加一榀又放不下`);
  }
  const bays = Array.from({ length: frames - 1 }, (_, i) => i === 0 || i === frames - 2 ? pitchEnd : pitch);
  const spanEW = spanOf(frames);
  const zs = [-spanEW / 2];
  for (const b of bays) zs.push(zs[zs.length - 1] + b);
  return { frames, bays, spanEW, zs };
}

// 檩条-组件节点优先取最东一跨中离榀位最远的一道组件缝。只有一列时取阵列东边。
function selectModuleGap(cols: number, arrW: number, pitchEW: number, zs: number[]) {
  const gaps = [];
  for (let j = 1; j < cols; j++) gaps.push(-arrW / 2 + j * pitchEW - FIX.modGapEW / 2);
  const eastFrame = zs[zs.length - 1], westFrame = zs[zs.length - 2] ?? -Infinity;
  const inBay = gaps.filter(gap => gap > westFrame && gap < eastFrame);
  let selected = arrW / 2 + FIX.modGapEW / 2;
  let bestClearance = -Infinity;
  for (const gap of inBay.length ? inBay : gaps) {
    const clearance = Math.min(...zs.map(z => Math.abs(gap - z)));
    if (clearance > bestClearance) {
      bestClearance = clearance;
      selected = gap;
    }
  }
  return selected;
}

export function layoutEW(p: ModelParameters, sections: MemberSections) {
  const dimensions = getPurlinDimensions(p);
  const { purlinLen, arrW, pitchEW } = dimensions;
  const warn: string[] = [];
  const frames = placeFrames(purlinLen, sections.purlin.f, p.pitchEnd, p.pitch, warn);
  const gapZ = selectModuleGap(p.cols, arrW, pitchEW, frames.zs);
  // 东西坡度：上面东西向的 z 都是沿檩条（沿坡）量的，榀距 = 两榀之间的檩条长度。
  // 换成世界坐标时沿坡 z 处水平位置 z·cos、抬高 z·sin（阵列中心不动），见 ewMatrix
  const i = (p.slopeEW || 0) / 100, ca = 1 / Math.hypot(1, i);
  const ew = { i, ca, sa: i * ca };
  const cuts = cutPurlin(p, purlinLen, frames.zs, arrW);
  if (!cuts.valid) {
    warn.push(cuts.error ? `檩条自定义分段无效，暂显示通长檩条。${cuts.error}` : '檩条切割无可行解，请调整榀距或最大长度；暂显示通长檩条');
  }
  return { ...dimensions, ...frames, cols: p.cols, gapZ, ew, cuts, warn };
}

export type Solution = ReturnType<typeof solve>;
export type EWLayout = ReturnType<typeof layoutEW>;
