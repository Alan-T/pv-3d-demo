import { getScene, tryGetScene } from './scene.ts';
import { M, ghostModules, ghostMat, applyPalette } from './materials.ts';
import { show, P } from './model-parameters.ts';
import { EY, V, V3, MM, DEG, ewMatrix, shared, track, getBuiltState } from './core.ts';
import * as THREE from 'three';
import { setFlatFrameDisplay } from './frame-projection.ts';
import { createClippingCaps } from './clipping-caps.ts';
import { createTieJointFocus } from './tie-joint-focus.ts';

import type { SectionRangeLayout } from './bracket.ts';
import type { PlanarJointSpec, JointType, TieJointSpec, TieJointType, ViewName } from './joint-view-types.ts';

type SceneCamera = THREE.OrthographicCamera | THREE.PerspectiveCamera;
type CameraPose = { target: THREE.Vector3; dir: THREE.Vector3; zoom: number };
type ZoomFrame = { t: THREE.Vector3; off: THREE.Vector3; z: number };

/* 视角与显示：各视图下显示哪些部分、相机取景和切换动画 */
const st = shared.state;

let cam: SceneCamera | null = null;
let tween: { from: ZoomFrame; to: ZoomFrame; t0: number; dur: number } | null = null;
let lastTiePose: CameraPose | null = null;

// ---------- 剖切范围与辅助判断 ----------
// 轴测节点图的剖切范围（mm）：支架节点取最东一榀往西 400、往东 300；
// 檩条-组件 / 中压块取组件缝两侧各 100；边压块取阵列东边往西 100 到檩条端头外。
const SECTION = { below: 400, above: 300, gap: 100, end: 100 };
const LOCKED_VIEWS = new Set(['side', 'front', 'top', 'normal']);
const FOLLOW_VIEWS = new Set(['normal', 'joint-elev', 'joint-iso']);
const clipLo = new THREE.Plane(new V3(0, 0, 1), 0);
const clipHi = new THREE.Plane(new V3(0, 0, -1), 0);

const isTieJoint = (type: JointType): type is TieJointType => type === 'postTie' || type === 'purlinTie';
const sectionKey = (type: JointType) =>
  type === 'mod' || type === 'side' || type === 'splice' || type === 'clip' ? type : 'frame';

function sectionRange(layout: SectionRangeLayout, key: string) {
  if (key === 'clip') {
    const z = layout.zs.at(-1)!;
    return [z - 150, z + 150];
  }
  // 连接件长 240，两端各保留 60 的檩条；避开邻近榀的斜梁及檩托。
  if (key === 'splice') {
    const z = layout.cuts.positions.at(-1) || 0;
    const half = (layout.purlinConnector?.length || 240) / 2 + 60;
    return [z - half, z + half];
  }
  if (key === 'mod') return [layout.gapZ - SECTION.gap, layout.gapZ + SECTION.gap];
  if (key === 'side') return [layout.arrW / 2 - SECTION.end, layout.purlinLen / 2 + SECTION.end];
  const z = layout.zs[layout.zs.length - 1];
  return [z - SECTION.below, z + SECTION.above];
}

// ---------- 显示开关与剖切 ----------

function syncShadows(renderer: THREE.WebGLRenderer, sun: THREE.DirectionalLight, root: THREE.Group) {
  if (renderer.shadowMap.enabled === show.shadows) return;
  renderer.shadowMap.enabled = show.shadows;
  sun.castShadow = show.shadows;
  renderer.shadowMap.needsUpdate = true;
  // 阴影开关影响材质着色器，切换时刷新已有构件，无需重建模型。
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite || object instanceof THREE.Points)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.needsUpdate = true;
  });
}

function applyDimensionVisibility(d: NonNullable<typeof st.dims>, view: ViewName) {
  d.root.visible = show.dims;
  d.key.visible = view === '3d' || view === 'side';
  d.side.visible = view === 'side';
  d.ew.visible = view === '3d' || view === 'front' || view === 'top';
  d.normal.visible = view === 'normal';
  d.topCuts.visible = view === 'top';
  d.joint.visible = view.startsWith('joint');
  for (const joint of d.joint.children) {
    joint.visible = joint.userData.joint === st.jointType + st.jointSel;
    if (!joint.visible) continue;
    for (const child of joint.children) {
      if (child.userData.jointView) child.visible = child.userData.jointView === view;
    }
  }
  d.deep.visible = show.buried;
}

function applyClippingPlanes(
  renderer: THREE.WebGLRenderer,
  layout: NonNullable<typeof st.layout>,
  view: ViewName,
  tieJoint: boolean,
  sectioned: boolean,
  key: string,
) {
  if (tieJoint) {
    const sp = layout.jointSpecs?.[st.jointType][st.jointSel];
    // 以真实连接点的局部包围盒裁切，立柱拉杆和檩条拉杆使用各自安装方向。
    renderer.clippingPlanes = sp?.matrix ? jointClipPlanes(sp) : [];
    return;
  }
  if (sectioned) {
    const [lo, hi] = sectionRange(layout, key);
    clipLo.constant = -lo * layout.ew.ca * MM;
    clipHi.constant = hi * layout.ew.ca * MM;
    renderer.clippingPlanes = [clipLo, clipHi];
    return;
  }
  if (view === 'side') {
    // 侧视统一只保留最东一榀附近，零坡度与非零坡度使用相同剖切范围。
    clipLo.constant = -sectionRange(layout, 'frame')[0] * MM;
    renderer.clippingPlanes = [clipLo];
    return;
  }
  renderer.clippingPlanes = [];
}

function applyTransparency(view: ViewName, inJoint: boolean, sectioned: boolean, mod: boolean) {
  // 檩条-组件、边压块的螺栓头在组件边框里或旁边，正视、轴测都让组件半透明
  const moduleOpacity = sectioned && !mod ? 0.2 : 0.32;
  ghostModules(view === 'normal' || (sectioned && st.jointType === 'clip') || (inJoint && mod), moduleOpacity);
  ghostMat(M.beam, inJoint && (st.jointType === 'top' || st.jointType === 'btop'), 0.42);
  // 檩条-檩条接头：连接件略透明，透出槽里的檩条接缝和螺栓
  ghostMat(M.purlinConnector, inJoint && st.jointType === 'splice', 0.6);

  const gm = M.ground;
  const wantTransparent = show.buried;
  if (gm.transparent !== wantTransparent) {
    gm.transparent = wantTransparent;
    gm.opacity = wantTransparent ? 0.5 : 1;
    gm.depthWrite = !wantTransparent;
    gm.needsUpdate = true;
  }
}

function updateTieJointContext(groups: NonNullable<typeof st.groups>, type: TieJointType | null) {
  const { renderer, root } = getScene();
  for (const caps of groups.tieCapCache?.values() ?? []) caps.visible = false;
  if (type) {
    groups.tieFocus ??= createTieJointFocus(groups, {
      track,
      supportMaterials: { postTie: [M.post, M.buried], purlinTie: [M.purlin] },
    });
    groups.tieCapCache ??= new Map();
    // 显示开关影响哪些实体会被裁切；尺寸/坡度/截面变化随模型重建清空缓存。
    const key = `${type}:${st.jointSel}:${show.bolts}:${show.buried}`;
    if (!groups.tieCapCache.has(key)) {
      const caps = createClippingCaps(groups.model, renderer.clippingPlanes, { track, materialFor: groups.tieFocus.materialFor });
      caps.name = `tie-joint-caps-${key}`;
      caps.userData.noBox = true;
      root.add(caps);
      groups.tieCapCache.set(key, caps);
    }
    groups.tieCapCache.get(key)!.visible = true;
  }
  groups.tieFocus?.apply(type);
}

function applyVisibility() {
  const { root, renderer, sun } = getScene();
  const { groups: g, dims: d, layout, view } = st;
  if (!g || !d || !layout) return;

  // 垂直组件为展开对照视图：抵消东西顺坡变换，组件及尺寸保持固定。
  root.matrixAutoUpdate = false;
  root.matrix.copy(view === 'normal' ? ewMatrix(layout.ew).invert() : new THREE.Matrix4());
  root.matrixWorldNeedsUpdate = true;

  // 先还原材质引用，再应用当前视图的配色和透明度，避免局部弱化影响其它视图。
  g.tieFocus?.restore();
  syncShadows(renderer, sun, root);
  applyDimensionVisibility(d, view);

  const inJoint = view.startsWith('joint');
  const tieJoint = inJoint && isTieJoint(st.jointType);
  const key = sectionKey(st.jointType);
  const mod = key !== 'frame' && key !== 'clip';
  const sideView = view === 'side';
  const sectioned = tieJoint || view === 'joint-iso' || (view === 'joint-elev' && (mod || st.jointType === 'clip' || !!layout.ew.i));

  g.buried.visible = show.buried;
  // 拉杆详图展示钢构连接，组件面板在檩条上方会遮住螺栓和槽口。
  g.modules.visible = show.modules && !tieJoint;
  g.postTies.visible = inJoint ? st.jointType === 'postTie' : show.postTies && !sideView;
  g.postTieHardware.visible = show.bolts;
  g.purlinTies.visible = inJoint ? st.jointType === 'purlinTie' : show.purlinTies && !sideView;
  g.purlinTieHardware.visible = show.bolts;
  g.hw.visible = show.bolts;
  g.ground.visible = !tieJoint;

  // 侧视使用未施加东西坡度的单榀截面；通长构件与标注保持原始安装高度。
  setFlatFrameDisplay(g.model, sideView);
  for (const k of ['modules', 'slope', 'hwSlope'] as const) {
    g[k].matrix.copy(sideView ? new THREE.Matrix4() : ewMatrix(layout.ew));
    g[k].matrixWorldNeedsUpdate = true;
  }
  for (const group of [d.key, d.side]) {
    group.matrix.copy(sideView ? new THREE.Matrix4() : ewMatrix(layout.ew, layout.zs.at(-1)));
    group.matrixWorldNeedsUpdate = true;
  }
  g.ground.matrix.copy(g.ground.userData.levelMatrix);
  if (!sideView) g.ground.matrix.premultiply(ewMatrix(layout.ew));
  g.ground.matrixWorldNeedsUpdate = true;

  applyClippingPlanes(renderer, layout, view, tieJoint, sectioned, key);
  for (const cg of g.caps) cg.visible = sectioned && !tieJoint && cg.userData.section === key;

  applyTransparency(view, inJoint, sectioned, mod);
  applyPalette();
  updateTieJointContext(g, tieJoint && isTieJoint(st.jointType) ? st.jointType : null);
}

// ---------- 相机取景与包围盒 ----------

function screenAxes(dir: THREE.Vector3) {
  const right = new V3().crossVectors(EY, dir).normalize(); // 相机在 target + dir 一侧、朝 -dir 看
  return [right, new V3().crossVectors(dir, right).normalize()];
}

function jointClipPlanes(sp: TieJointSpec) {
  const [x0, x1, y0, y1, z0, z1] = sp.clipBox;
  return (
    [
      [new V3(1, 0, 0), -x0],
      [new V3(-1, 0, 0), x1],
      [new V3(0, 1, 0), -y0],
      [new V3(0, -1, 0), y1],
      [new V3(0, 0, 1), -z0],
      [new V3(0, 0, -1), z1],
    ] as const
  ).map(([normal, offset]) => new THREE.Plane(normal, offset * MM).applyMatrix4(sp.matrix));
}

function tieJointPose(sp: TieJointSpec, name: ViewName): CameraPose {
  const { canvas, controls } = getScene();
  const localDirection = new V3(...(name === 'joint-elev' ? [0, 0, 1] : sp.isoDirection ?? [0.5, 0.35, 1]));
  const dir = localDirection.applyMatrix3(new THREE.Matrix3().getNormalMatrix(sp.matrix)).normalize();
  const [right, up] = screenAxes(dir);
  const origin = new V3().setFromMatrixPosition(sp.matrix);
  const points: { x: number; y: number; left: number; right: number; bottom: number; top: number }[] = [];

  const project = (local: THREE.Vector3, left = 0, rightEdge = 0, bottom = 0, top = 0) => {
    const offset = local.clone().applyMatrix4(sp.matrix).sub(origin);
    points.push({ x: offset.dot(right), y: offset.dot(up), left, right: rightEdge, bottom, top });
  };

  const [x0, x1, y0, y1, z0, z1] = sp.clipBox;
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) project(V(x, y, z));

  const cw = canvas.clientWidth || 1;
  const ch = canvas.clientHeight || 1;
  if (show.dims) {
    const annotations = st.dims?.joint.children.find((group) => group.userData.joint === st.jointType + st.jointSel);
    annotations?.traverseVisible((object) => {
      if (object instanceof THREE.LineSegments) {
        const vertices = object.geometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) project(new V3().fromBufferAttribute(vertices, i));
      }
      if (!(object instanceof THREE.Sprite)) return;
      const { outside, px, aspect } = object.userData;
      const height = px * (cw < 520 ? 1 : 1.25);
      const width = height * aspect;
      // 与 updateLabels 一致：引线文字沿屏幕水平外移，尺寸文字沿本地尺寸轴外移。
      const shift = outside.screenSide
        ? right.clone().multiplyScalar(outside.screenSide)
        : outside.dir.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(sp.matrix));
      shift.multiplyScalar(width / 2 + 6);
      const dx = shift.dot(right);
      const dy = shift.dot(up);
      project(outside.at, dx - width / 2, dx + width / 2, dy - height / 2, dy + height / 2);
    });
  }

  const top = (canvas.parentElement?.querySelector<HTMLElement>('#bar')?.offsetHeight ?? 0) + 12;
  const bottom = (canvas.parentElement?.querySelector<HTMLElement>('#legend')?.offsetHeight ?? 0) + 24;
  const width = cw - (cw < 520 ? 24 : 64);
  const height = Math.max(24, ch - top - bottom);

  // 模型随相机缩放，文字保持像素大小。用二者的实际投影求能完整显示的最大比例。
  const bounds = (scale: number) => {
    const box = new THREE.Box2();
    for (const p of points) {
      box.min.x = Math.min(box.min.x, p.x * scale + p.left);
      box.max.x = Math.max(box.max.x, p.x * scale + p.right);
      box.min.y = Math.min(box.min.y, p.y * scale + p.bottom);
      box.max.y = Math.max(box.max.y, p.y * scale + p.top);
    }
    return box;
  };

  let scale = 1;
  let limit = Math.min(3000, (controls.maxZoom * ch) / 2); // px/m，至多 3 px/mm
  for (let i = 0; i < 14; i++) {
    const mid = (scale + limit) / 2;
    const size = bounds(mid).getSize(new THREE.Vector2());
    if (size.x <= width && size.y <= height) scale = mid;
    else limit = mid;
  }

  const center = bounds(scale).getCenter(new THREE.Vector2());
  const target = origin
    .addScaledVector(right, center.x / scale)
    .addScaledVector(up, (center.y + (top - bottom) / 2) / scale);
  return { target, dir, zoom: (2 * scale) / ch };
}

function normalViewPose(canvas: HTMLCanvasElement): CameraPose {
  const { S, layout } = getBuiltState();
  const n = new V3(-S.s, S.c, 0);
  const dir = n.clone().normalize();
  const [right, up] = screenAxes(dir);
  const low = S.modStarts[0] - 500;
  const high = S.modStarts.at(-1)! + P.modL + 950;
  const halfW = layout.purlinLen / 2 + 350;
  const points: THREE.Vector3[] = [];
  for (const t of [low, high]) {
    for (const z of [-halfW, halfW]) {
      const q = S.along(t);
      points.push(V(q.x, q.y, z).addScaledVector(n, (S.hModBot + P.modT) * MM));
    }
  }
  const xs = points.map((p) => p.dot(right));
  const ys = points.map((p) => p.dot(up));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const target = points[0]
    .clone()
    .addScaledVector(right, (x0 + x1) / 2 - xs[0])
    .addScaledVector(up, (y0 + y1) / 2 - ys[0]);
  const pw = Math.max(80, canvas.clientWidth - 128);
  const ph = Math.max(80, canvas.clientHeight - 144);
  const half = (Math.max((x1 - x0) / pw, (y1 - y0) / ph) * canvas.clientHeight) / 2;
  return { target, dir, zoom: 1 / half };
}

function spliceJointPose(
  sp: PlanarJointSpec,
  name: ViewName,
  z: number,
  W: THREE.Matrix4,
  cw: number,
  ch: number,
  labelPx: number,
): CameraPose {
  const { layout } = getBuiltState();
  const xL = Math.min(sp.box[0], sp.box[1]);
  const xR = Math.max(sp.box[0], sp.box[1]);
  const [, , yB, yT] = sp.box;
  // 正视沿檩条轴线看截面；有东西坡度时相机随檩条方向倾斜。
  const dir = name === 'joint-elev' ? new V3(0, layout.ew.sa, layout.ew.ca) : new V3(-0.85, 0.65, 0.65).normalize();
  const [right, up] = screenAxes(dir);
  const points: THREE.Vector3[] = [];
  for (const x of [xL, xR]) {
    for (const y of [yB, yT]) {
      for (const dz of [-180, 180]) points.push(V(x, y, z + dz).applyMatrix4(W));
    }
  }
  for (const [x, y, ly, , pz] of sp.leaders) {
    points.push(V(x, y, pz ?? sp.zl ?? z).applyMatrix4(W));
    points.push(V(sp.anchorX, ly, sp.zl ?? z).applyMatrix4(W));
  }
  const xs = points.map((p) => p.dot(right));
  const ys = points.map((p) => p.dot(up));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.max(0.05, Math.min(2.5, (cw - labelPx - 40) / ((maxX - minX) / MM), (ch - 190) / ((maxY - minY) / MM)));
  const target = points[0]
    .clone()
    .addScaledVector(right, (minX + maxX) / 2 - xs[0] + ((labelPx / 2 / scale) * MM))
    .addScaledVector(up, (minY + maxY) / 2 - ys[0]);
  return { target, dir, zoom: 1 / ((ch / 2 / scale) * MM) };
}

function framePose(name: ViewName): CameraPose {
  const { canvas } = getScene();
  const { S, layout } = getBuiltState();
  if (name === 'normal') return normalViewPose(canvas);

  const sp = layout.jointSpecs?.[st.jointType][st.jointSel];
  if (!sp) throw new Error('连接节点尚未构建');
  if (sp.matrix) {
    lastTiePose = tieJointPose(sp, name);
    return lastTiePose;
  }

  const zLast = layout.zs[layout.zs.length - 1];
  const frame = ['frame', 'clip'].includes(sectionKey(st.jointType));
  const z = sp.z === undefined ? zLast + S.sections.postF.f / 2 : sp.z;
  const W = ewMatrix(layout.ew, frame ? zLast : undefined); // 东西坡度：沿坡坐标 -> 世界
  const cw = canvas.clientWidth || 1;
  const ch = canvas.clientHeight || 1;
  const labelPx = cw < 520 ? 170 : 230;

  if (st.jointType === 'splice') return spliceJointPose(sp, name, z, W, cw, ch, labelPx);

  if (!frame && name === 'joint-iso' && sp.at) {
    const dir = new V3(-0.7, 1, 1).normalize();
    const [right] = screenAxes(dir);
    const scale = Math.max(0.2, Math.min(3, (cw - labelPx - 40) / 200, (ch - 190) / 180));
    const target = V(sp.at.x, sp.at.y, z).applyMatrix4(W).addScaledVector(right, (labelPx / 2 / scale) * MM);
    return { target, dir, zoom: 1 / ((ch / 2 / scale) * MM) };
  }

  const xL = Math.min(sp.box[0], sp.box[1]);
  const xR = Math.max(sp.box[0], sp.box[1]);
  const [, , yB, yT] = sp.box;
  const scale = Math.max(0.2, Math.min(3, (cw - labelPx - 40) / (xR - xL), (ch - 190) / (yT - yB)));
  const target = V((xL + xR) / 2 + (sp.labelSide * labelPx) / 2 / scale, (yB + yT) / 2 + 40 / scale, z).applyMatrix4(W);
  // 轴测一般偏向文字一侧；檩托在檩条下坡一侧，所以檩条-斜梁从下坡（南）一侧看
  const sx = st.jointType === 'clip' ? -1 : sp.labelSide;
  const dir = name === 'joint-elev' ? new V3(0, 0, 1) : new V3(0.4 * sx, 0.3, 1).normalize();
  return { target, dir, zoom: 1 / ((ch / 2 / scale) * MM) };
}

function visibleBox(objs: THREE.Object3D[], pre?: THREE.Matrix4) {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const m = new THREE.Matrix4();
  const visit = (o: THREE.Object3D) => {
    if (!o.visible || o instanceof THREE.Sprite || o.userData.noBox) return;
    if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      tmp.copy(o.geometry.boundingBox!).applyMatrix4(pre ? m.multiplyMatrices(pre, o.matrixWorld) : o.matrixWorld);
      box.union(tmp);
    }
    for (const ch of o.children) visit(ch);
  };
  for (const o of objs) {
    o.updateMatrixWorld(true);
    visit(o);
  }
  return box;
}

function placeSun() {
  const { sun } = getScene();
  const box = visibleBox([getBuiltState().groups.model]);
  const ctr = box.getCenter(new V3());
  const rad = box.getSize(new V3()).length() / 2 + 2;
  sun.position.copy(ctr).addScaledVector(new V3(-0.55, 0.78, 0.32).normalize(), rad + 12);
  sun.target.position.copy(ctr);
  const sc = sun.shadow.camera;
  sc.left = -rad;
  sc.right = rad;
  sc.top = rad;
  sc.bottom = -rad;
  sc.near = 0.5;
  sc.far = 2 * rad + 30;
  sc.updateProjectionMatrix();
}

// ---------- 视角切换与过渡动画 ----------

function lockView(locked: boolean) {
  const { controls } = getScene();
  controls.enableRotate = !locked;
  controls.mouseButtons.LEFT = locked ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  controls.touches.ONE = locked ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
}

function savePose() {
  return st.layout && FOLLOW_VIEWS.has(st.view) ? framePose(st.view) : null;
}

function follow(oldPose: CameraPose | null) {
  const { controls } = getScene();
  if (!cam || !oldPose || !FOLLOW_VIEWS.has(st.view)) return;
  if (tween) {
    setView(st.view, true);
    return;
  }
  const np = framePose(st.view);
  const [r0, u0] = screenAxes(oldPose.dir);
  const [r1, u1] = screenAxes(np.dir);
  const off = controls.target.clone().sub(oldPose.target);
  // 垂直组件锁定了方向，跟着新的组件法向转；节点视图保留用户自己转过的方向
  const dir = st.view === 'normal' ? np.dir : cam.position.clone().sub(controls.target).normalize();
  if (st.view.startsWith('joint') && isTieJoint(st.jointType)) {
    dir.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(oldPose.dir, np.dir));
  }
  controls.target.copy(np.target).addScaledVector(r1, off.dot(r0)).addScaledVector(u1, off.dot(u0));
  cam.position.copy(controls.target).addScaledVector(dir, 60);
  cam.zoom *= np.zoom / oldPose.zoom;
  cam.updateProjectionMatrix();
  cam.lookAt(controls.target);
  controls.update();
}

/** 面板收放或屏幕旋转后按新画布取景，保留用户已经做过的旋转、平移和缩放。 */
export function resizeTieJointView() {
  if (st.view.startsWith('joint') && isTieJoint(st.jointType)) follow(lastTiePose);
}

function setView(name: ViewName, instant = false) {
  const { ortho, persp } = getScene();
  st.view = name;
  lockView(LOCKED_VIEWS.has(name));
  applyVisibility();
  if (FOLLOW_VIEWS.has(name)) {
    const p = framePose(name);
    goTo(ortho, p.target.clone().addScaledVector(p.dir, 60), p.target, p.zoom, instant);
    return;
  }
  const { groups: { model }, dims: d } = getBuiltState();
  const objs = name === 'side' && show.dims && d ? [model, d.key, d.side] : [model];
  const box = visibleBox(objs);
  const ctr = box.getCenter(new V3());
  const size = box.getSize(new V3());
  const aspect = persp.aspect;
  if (name === '3d') {
    const dir = new V3(-1, 0.68, 1.25).normalize();
    const vf = persp.fov * DEG;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const dist = (visibleBox([model]).getSize(new V3()).length() / 2 / Math.sin(Math.min(vf, hf) / 2)) * (aspect < 1 ? 0.95 : 0.86);
    goTo(persp, ctr.clone().addScaledVector(dir, dist), ctr, null, instant);
    return;
  }
  let dir: THREE.Vector3;
  let w: number;
  let h: number;
  if (name === 'side') {
    dir = new V3(0, 0, 1);
    w = size.x + (show.dims ? 1.6 : 0); // 两端文字留边
    h = size.y;
  } else if (name === 'front') {
    dir = new V3(-1, 0, 0);
    w = size.z;
    h = size.y;
  } else {
    dir = new V3(-0.002, 1, 0).normalize();
    w = size.z;
    h = size.x;
  }
  const half = Math.max(h / 2, w / 2 / aspect) * 1.1;
  goTo(ortho, ctr.clone().addScaledVector(dir, 60), ctr, 1 / half, instant);
}

function goTo(next: SceneCamera, pos: THREE.Vector3, target: THREE.Vector3, zoom: number | null, instant: boolean) {
  const { persp, controls } = getScene();
  if (!cam) return;
  const fovT = Math.tan((persp.fov * DEG) / 2);
  if (next !== cam) {
    // 换相机时保持当前朝向与画面比例，过渡才连贯
    const dir = cam.position.clone().sub(controls.target).normalize();
    if (next instanceof THREE.OrthographicCamera) {
      next.zoom = 1 / (cam.position.distanceTo(controls.target) * fovT);
      next.position.copy(controls.target).addScaledVector(dir, 60);
    } else {
      next.position.copy(controls.target).addScaledVector(dir, 1 / (cam.zoom * fovT));
    }
    next.updateProjectionMatrix();
    next.lookAt(controls.target);
    cam = next;
    controls.object = next;
  }
  if (instant) {
    cam.position.copy(pos);
    controls.target.copy(target);
    if (zoom) {
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
    }
    controls.update();
    tween = null;
    return;
  }
  tween = {
    from: { off: cam.position.clone().sub(controls.target), t: controls.target.clone(), z: cam.zoom },
    to: { off: pos.clone().sub(target), t: target.clone(), z: zoom || cam.zoom },
    t0: performance.now(),
    dur: 700,
  };
}

function stepTween(now: number) {
  const { controls } = getScene();
  if (!tween || !cam) return;
  const k = Math.min(1, (now - tween.t0) / tween.dur);
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const f = tween.from;
  const t = tween.to;
  const d0 = f.off.clone().normalize();
  const d1 = t.off.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(d0, d1);
  const qe = new THREE.Quaternion().slerp(q, e);
  const len = f.off.length() + (t.off.length() - f.off.length()) * e;
  controls.target.lerpVectors(f.t, t.t, e);
  cam.position.copy(controls.target).add(d0.applyQuaternion(qe).multiplyScalar(len));
  if (cam instanceof THREE.OrthographicCamera) {
    cam.zoom = f.z * Math.pow(t.z / f.z, e);
    cam.updateProjectionMatrix();
  }
  cam.lookAt(controls.target);
  if (k >= 1) {
    tween = null;
    controls.update();
  }
}

function cancelTween() {
  tween = null;
}

export function initView() {
  const { persp, controls } = getScene();
  cam = persp;
  tween = null;
  controls.addEventListener('start', cancelTween);
}

export function disposeView() {
  tryGetScene()?.controls.removeEventListener('start', cancelTween);
  cam = null;
  lastTiePose = null;
  tween = null;
}

function tick(now: number) {
  const { controls } = getScene();
  if (tween) stepTween(now);
  else controls.update();
}

export const view = {
  set: setView,
  applyVisibility,
  placeSun,
  savePose,
  follow,
  tick,
  sectionRange,
  get camera() {
    return cam;
  },
};

export { setView, applyVisibility, placeSun, savePose, follow, tick, sectionRange };

export function getCamera() {
  if (!cam) throw new Error('视图相机尚未初始化');
  return cam;
}
