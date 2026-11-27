import type { RuntimeContext } from './runtime-context.ts';
import type { SceneController } from './scene.ts';
import { createDimensionGraphics, type DimensionSet } from './dimension-graphics.ts';
import { V, V3, MM, DEG, ewPlace } from '../model/geometry/core.ts';
import type { ModelParameters, NumericParameterKey } from '../domain/design-types.ts';
import { buildJointSpecs } from './joint-detail.ts';
import { PURLIN_CUT_RULES } from '../config/engineering-rules.ts';
import { createJointAnnotationRenderer } from './joint-annotations.ts';
import * as THREE from 'three';

import type { Solution, EWLayout } from '../domain/solve.ts';

/* 尺寸标注：侧视、东西向、垂直组件视图的标注；文字精灵保持固定屏幕像素大小。连接节点详图见 joint-detail.ts */

/** 标记可点击编辑的蓝字标注对应参数。 */
function editable<T extends THREE.Sprite | { label: THREE.Sprite }>(d: T, k: NumericParameterKey): T {
  const sprite = d instanceof THREE.Sprite ? d : d.label;
  sprite.userData.edit = k;
  return d;
}

function addFrameDimensions(
  parameters: ModelParameters,
  solution: Solution,
  layout: ReturnType<RuntimeContext['getBuiltState']>['layout'],
  sets: { key: DimensionSet; side: DimensionSet; deep: DimensionSet; ref: DimensionSet; groundLine: DimensionSet },
) {
  const { key, side, deep, ref, groundLine } = sets;
  const round = Math.round;
  const annotationZ = layout.zs[layout.zs.length - 1] + 450; // 标注放在最东一榀前面（侧视图朝向相机）
  const framePoint = (x: number, y: number) => V(x, y, annotationZ);
  const slopeNormal = new V3(-solution.s, solution.c, 0);
  const offsetXY = (dx: number, dy: number) => new V3(dx * MM, dy * MM, 0);
  const offsetNormal = (k: number) => slopeNormal.clone().multiplyScalar(k * MM);
  const beamPoint = (t: number, h: number) => {
    const q = solution.along(t);
    return framePoint(q.x - solution.s * h, q.y + solution.c * h);
  };

  // ±0 水平线与倾角
  const gx0 = -900;
  const gx1 = solution.xr + 1100;
  ref.seg(framePoint(gx0, 0), framePoint(gx1, 0));
  ref.label('±0.000', framePoint(gx0, 60), 'ref', 13);

  const tiltRad = parameters.tilt * DEG;
  const x0 = solution.xf - solution.nodeF / Math.tan(tiltRad);
  const arcRadius = solution.xf + 0.6 * parameters.span - x0;
  const arcAt = (a: number) => framePoint(x0 + arcRadius * Math.cos(a), arcRadius * Math.sin(a));
  for (let i = 0; i < 48; i++) key.seg(arcAt((tiltRad * i) / 48), arcAt((tiltRad * (i + 1)) / 48));
  for (const a of [0, tiltRad]) {
    const p = arcAt(a);
    const tick = new V3(Math.cos(a) - Math.sin(a), Math.sin(a) + Math.cos(a), 0).normalize().multiplyScalar(0.045);
    key.seg(p.clone().sub(tick), p.clone().add(tick));
  }
  editable(key.label(`${parameters.tilt}°`, arcAt(tiltRad / 2), 'in'), 'tilt');

  if (parameters.slopeNS) {
    const up = parameters.slopeNS > 0;
    groundLine.seg(framePoint(gx0, solution.gy(gx0)), framePoint(gx1, solution.gy(gx1)));
    editable(
      groundLine.label(`${up ? '南向坡' : '北向坡'} ${Math.abs(parameters.slopeNS)}%`, framePoint(gx1 + 380, solution.gy(gx1) + (up ? 40 : -40)), 'in', 13),
      'slopeNS',
    );
    side.dim(framePoint(solution.xr, 0), framePoint(solution.xr, solution.gR), offsetXY(620, 0), round(Math.abs(solution.gR)), 'out');
    if (!parameters.alongSlope) {
      ref.seg(framePoint(gx0, -solution.gy(gx0)), framePoint(gx1, -solution.gy(gx1)), true);
      ref.label(`反向参考 · ${up ? '北向坡' : '南向坡'} ${Math.abs(parameters.slopeNS)}%`, framePoint(solution.xr, -solution.gR + (up ? -120 : 120)), 'ref', 13);
      side.dim(framePoint(solution.xr, 0), framePoint(solution.xr, -solution.gR), offsetXY(620, 0), round(Math.abs(solution.gR)), 'out');
    }
  }

  // 高度与间距
  editable(key.dim(framePoint(0, 0), framePoint(0, parameters.h0), offsetXY(-230, 0), round(parameters.h0), 'in'), 'h0');
  editable(key.dim(framePoint(solution.xf, 0), framePoint(solution.xr, 0), offsetXY(0, -170), round(parameters.span), 'in'), 'span');
  key.dim(framePoint(solution.xf, 0), framePoint(solution.xf, solution.topF), offsetXY(230, 0), round(solution.topF), 'out');
  editable(side.dim(framePoint(solution.xf, 0), framePoint(solution.xf, parameters.braceHF), offsetXY(-230, 0), parameters.braceHF, 'in'), 'braceHF');
  key.dim(framePoint(solution.xr, 0), framePoint(solution.xr, solution.topR), offsetXY(-260, 0), round(solution.topR), 'out');
  editable(side.dim(framePoint(solution.xr, 0), framePoint(solution.xr, parameters.braceHR), offsetXY(230, 0), parameters.braceHR, 'in'), 'braceHR');

  // 斜梁、斜撑连接点、悬挑
  key.dim(beamPoint(0, 0), beamPoint(solution.beamLen, 0), offsetNormal(-430), round(solution.beamLen), 'out');
  editable(side.dim(beamPoint(0, 0), beamPoint(solution.tF, 0), offsetNormal(-210), round(solution.tF), 'in'), 'braceTopF');
  editable(side.dim(beamPoint(solution.tR, 0), beamPoint(solution.beamLen, 0), offsetNormal(-210), round(solution.beamLen - solution.tR), 'in'), 'braceTopR');
  side.dim(beamPoint(solution.beamLen - solution.ovh, 0), beamPoint(solution.beamLen, 0), offsetNormal(420), round(solution.ovh), 'out');
  if (solution.outer) {
    editable(side.dim(beamPoint(0, 0), beamPoint(solution.outer.toF, 0), offsetNormal(-320), round(solution.outer.toF), 'in'), 'braceOutF');
    editable(side.dim(beamPoint(solution.outer.toR, 0), beamPoint(solution.beamLen, 0), offsetNormal(-320), round(solution.beamLen - solution.outer.toR), 'in'), 'braceOutR');
  }

  // 组件与檩条
  const hTop = solution.hModBot + parameters.modT;
  for (const m0 of solution.modStarts) editable(side.dim(beamPoint(m0, hTop), beamPoint(m0 + parameters.modL, hTop), offsetNormal(560), parameters.modL, 'in'), 'modL');
  editable(side.dim(beamPoint(solution.purlins[0], solution.hModBot), beamPoint(solution.purlins[1], solution.hModBot), offsetNormal(330), parameters.hole, 'in'), 'hole');

  // 斜撑长度（标在斜撑外下侧）
  const braces = layout.joints.flatMap(joint => joint.o ? [joint, joint.o] : [joint]);
  for (const { E: start, end, len: braceLength } of braces) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    // 选择朝下的截面法线，使尺寸线始终在斜撑外侧。
    const sideSign = dx > 0 ? -1 : 1;
    const offset = offsetXY(-dy / length * sideSign * 160, dx / length * sideSign * 160);
    side.dim(framePoint(start.x, start.y), framePoint(end.x, end.y), offset, round(braceLength), 'out');
  }

  // 地下部分
  editable(deep.dim(framePoint(solution.xf, solution.botF), framePoint(solution.xf, 0), offsetXY(230, 0), parameters.embed, 'in'), 'embed');
  editable(deep.dim(framePoint(solution.xr, solution.botR), framePoint(solution.xr, solution.embedLevelR), offsetXY(-260, 0), parameters.embed, 'in'), 'embed');
  deep.dim(framePoint(solution.xf, solution.botF), framePoint(solution.xf, solution.topF), offsetXY(-470, 0), round(solution.lenF), 'out');
  deep.dim(framePoint(solution.xr, solution.botR), framePoint(solution.xr, solution.topR), offsetXY(480, 0), round(solution.lenR), 'out');
}

function addEastWestDimensions(parameters: ModelParameters, layout: EWLayout, ew: DimensionSet) {
  const annotationX = -500;
  const pointAt = (z: number) => V(annotationX, 0, z);
  const frameZPositions = layout.zs;

  function addBayPitch(startIndex: number, key: 'pitch' | 'pitchEnd', label: string) {
    const pitch = parameters[key];
    const projected = Math.round(pitch * layout.ew.ca);
    const note = layout.ew.i ? `（水平 ${projected}）` : '';
    const dimension = ew.dim(
      pointAt(frameZPositions[startIndex]), pointAt(frameZPositions[startIndex + 1]),
      V(-300, 0, 0), `${label} ${pitch}${note}`, 'in',
    );
    editable(dimension, key);
  }

  if (frameZPositions.length > 1) addBayPitch(0, 'pitchEnd', '首末跨榀距');
  if (frameZPositions.length > 3) addBayPitch(1, 'pitch', '中间跨榀距');
  const arrayWidth = ew.dim(
    pointAt(-layout.arrW / 2), pointAt(layout.arrW / 2),
    V(-750, 0, 0), `组件阵列 ${Math.round(layout.arrW)}（${layout.cols} 列）`, 'in',
  );
  editable(arrayWidth, 'cols');
  if (layout.ew.i) {
    ew.label(`实际地面 ${parameters.slopeEW > 0 ? '东高西低' : '东低西高'} ${Math.abs(parameters.slopeEW)}%`, V(annotationX, -450, layout.arrW * 0.3), 'ref', 13);
  }
}

function addNormalDimensions(
  parameters: ModelParameters, solution: Solution, layout: EWLayout,
  normalDims: DimensionSet, topCuts: DimensionSet, purlinLines: DimensionSet, beamLines: DimensionSet,
) {
  const round = Math.round;
  const annotationHeight = solution.hModBot + parameters.modT + 150;
  const planePoint = (t: number, z: number) => {
    const q = solution.along(t);
    return V(q.x - solution.s * annotationHeight, q.y + solution.c * annotationHeight, z);
  };
  const offsetAlongSlope = (k: number) => new V3(solution.c, solution.s, 0).multiplyScalar(k * MM);
  const offsetEastWest = (k: number) => new V3(0, 0, k * MM);
  const halfL = layout.purlinLen / 2;
  const tLow = solution.modStarts[0];
  const tHigh = solution.modStarts[solution.modStarts.length - 1] + parameters.modL;

  normalDims.dim(planePoint(tHigh, -halfL), planePoint(tHigh, halfL), offsetAlongSlope(700), `檩条 ×${solution.purlins.length}　${solution.sections.purlin.name}　总长 ${round(layout.purlinLen)}`, 'out', 13);
  if (layout.cuts.valid) {
    for (const seg of layout.cuts.segments) {
      const text = String(Math.round(seg.length * 10) / 10);
      normalDims.dim(planePoint(tHigh, seg.start), planePoint(tHigh, seg.start + seg.length), offsetAlongSlope(350), text, 'out', 13);
      topCuts.dim(planePoint(tHigh, seg.start), planePoint(tHigh, seg.start + seg.length), offsetAlongSlope(350), text, 'out', 13);
    }
  }
  topCuts.dim(planePoint(tHigh, -halfL), planePoint(tHigh, halfL), offsetAlongSlope(700), `檩条总长 ${round(layout.purlinLen)}（接缝${PURLIN_CUT_RULES.gap}）`, 'out', 13);

  const stops = [-halfL, ...layout.zs, halfL];
  const last = stops.length - 2;
  for (let i = 0; i <= last; i++) {
    const d = normalDims.dim(planePoint(tLow, stops[i]), planePoint(tLow, stops[i + 1]), offsetAlongSlope(-350), round(stops[i + 1] - stops[i]), i === 0 || i === last ? 'out' : 'in');
    if (i === 0) d.label.userData.outside = { at: d.A, dir: new V3(0, 0, -1) };
    else if (i === last) d.label.userData.outside = { at: d.B, dir: new V3(0, 0, 1) };
    else {
      const endBay = i === 1 || i === last - 1;
      editable(d, endBay ? 'pitchEnd' : 'pitch').label.userData.fit = { span: d.A.distanceTo(d.B), key: 'pitch' };
    }
  }
  if (last > 1) {
    const bayCount = layout.bays.length;
    const middleBayCount = bayCount - 2;
    const text =
      parameters.pitchEnd === parameters.pitch || bayCount < 2
        ? `${bayCount} × ${parameters.pitchEnd}`
        : middleBayCount > 0
          ? `${parameters.pitchEnd} + ${middleBayCount} × ${parameters.pitch} + ${parameters.pitchEnd}`
          : `${parameters.pitchEnd} + ${parameters.pitchEnd}`;
    editable(normalDims.label(text, planePoint(tLow, 0).add(offsetAlongSlope(-350)), 'in'), middleBayCount > 0 ? 'pitch' : 'pitchEnd').userData.altFor = 'pitch';
  }

  for (let i = 0; i < solution.purlins.length - 1; i++) {
    normalDims.dim(planePoint(solution.purlins[i], -halfL), planePoint(solution.purlins[i + 1], -halfL), offsetEastWest(-350), round(solution.purlins[i + 1] - solution.purlins[i]), 'out');
  }
  for (const m0 of solution.modStarts) editable(normalDims.dim(planePoint(m0, halfL), planePoint(m0 + parameters.modL, halfL), offsetEastWest(350), parameters.modL, 'in'), 'modL');

  for (const t of solution.purlins) purlinLines.seg(planePoint(t, -halfL), planePoint(t, halfL));
  for (const z of layout.zs) beamLines.seg(planePoint(0, z), planePoint(solution.beamLen, z));
}

export function createDimensions(context: RuntimeContext, scene: SceneController) {
  const { parameters } = context;
  const { getScene } = scene;
  const graphics = createDimensionGraphics(context);
  const { DimSet, dimensionMaterials, disposeDimensions } = graphics;
  const renderJointAnnotations = createJointAnnotationRenderer(context, graphics);

  function build() {
    const { S: solution, layout } = context.getBuiltState();
    const key = new DimSet();
    const side = new DimSet();
    const deep = new DimSet();
    const ref = new DimSet();
    const groundLine = new DimSet();
    const ew = new DimSet();
    const normalDims = new DimSet();
    const topCuts = new DimSet();
    const purlinLines = new DimSet();
    const beamLines = new DimSet();

    addFrameDimensions(parameters, solution, layout, { key, side, deep, ref, groundLine });
    addEastWestDimensions(parameters, layout, ew);
    addNormalDimensions(parameters, solution, layout, normalDims, topCuts, purlinLines, beamLines);

    const { specs, labelPlaneZ } = buildJointSpecs(parameters, solution, layout);
    layout.jointSpecs = specs;
    const jointG = renderJointAnnotations(specs, labelPlaneZ, layout);
    const deepG = deep.finish(dimensionMaterials.line);
    const sideG = new THREE.Group();
    sideG.add(side.finish(dimensionMaterials.line), ref.finish(dimensionMaterials.reference), deepG);
    const keyG = new THREE.Group();
    keyG.add(key.finish(dimensionMaterials.line), groundLine.finish(dimensionMaterials.ground));
    const ewG = ew.finish(dimensionMaterials.line);
    const normalG = normalDims.finish(dimensionMaterials.line);
    const topCutsG = topCuts.finish(dimensionMaterials.line);
    normalG.add(purlinLines.finish(dimensionMaterials.purlin), beamLines.finish(dimensionMaterials.beam));

    // 东西坡度：侧视标注跟着最东一榀平移，东西向、垂直组件视图的标注顺坡
    const zLast = layout.zs[layout.zs.length - 1];
    for (const gr of [keyG, sideG]) ewPlace(gr, layout.ew, zLast);
    for (const gr of [ewG, normalG, topCutsG]) ewPlace(gr, layout.ew);

    const rootG = new THREE.Group();
    rootG.add(keyG, sideG, ewG, normalG, jointG, topCutsG);
    getScene().root.add(rootG);
    context.state.dims = { root: rootG, key: keyG, side: sideG, deep: deepG, ew: ewG, normal: normalG, joint: jointG, topCuts: topCutsG };
  }

  // 标注文字保持固定的屏幕像素高度（每帧调用）
  const tmpV = new V3();
  const camDir = new V3();
  const labelRight = new V3();
  const labelParentInverse = new THREE.Matrix3();

  function updateLabels(cam: THREE.PerspectiveCamera | THREE.OrthographicCamera, viewport: Pick<HTMLElement, 'clientHeight' | 'clientWidth'> = getScene().canvas) {
    const viewportHeight = viewport.clientHeight || 1;
    const labelScale = viewport.clientWidth < 520 ? 1 : 1.25;
    context.state.labelK = labelScale;
    const perspective = cam instanceof THREE.PerspectiveCamera;
    const viewHeight = perspective ? 2 * Math.tan(cam.fov * DEG / 2) : (cam.top - cam.bottom) / cam.zoom;
    const unitsPerPixel = viewHeight / viewportHeight;
    const collapsed = new Set<string>();
    cam.getWorldDirection(camDir);

    for (const sp of context.labels) {
      sp.getWorldPosition(tmpV);
      const wpp = perspective ? unitsPerPixel * Math.max(0.05, tmpV.sub(cam.position).dot(camDir)) : unitsPerPixel;
      const ud = sp.userData;
      const hgt = ud.px * labelScale * wpp;
      const w = hgt * ud.aspect;
      sp.scale.set(w, hgt, 1);

      if (ud.outside) {
        let direction = ud.outside.dir;
        if (ud.outside.screenSide) {
          labelParentInverse.setFromMatrix4(sp.parent!.matrixWorld).invert();
          direction = labelRight.setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(ud.outside.screenSide).applyMatrix3(labelParentInverse);
        }
        sp.position.copy(ud.outside.at).addScaledVector(direction, w / 2 + 6 * wpp);
      }
      if (ud.fit && w >= ud.fit.span * 0.92) collapsed.add(ud.fit.key);
    }

    for (const sp of context.labels) {
      const { fit, altFor } = sp.userData;
      if (fit) sp.visible = !collapsed.has(fit.key);
      else if (altFor) sp.visible = collapsed.has(altFor);
    }
  }

  return { build, updateLabels, disposeDimensions };
}

export type DimensionController = ReturnType<typeof createDimensions>;
