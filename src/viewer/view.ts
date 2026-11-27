import type { RuntimeContext } from './runtime-context.ts';
import type { SceneController } from './scene.ts';
import type { ViewerMaterials } from './materials.ts';
import { JOINT_VIEW_CONFIG } from '../config/engineering-rules.ts';
import { V, V3, MM, DEG, ewMatrix } from '../model/geometry/core.ts';
import * as THREE from 'three';
import { setFlatFrameDisplay } from '../model/geometry/frame-projection.ts';
import { createClippingCaps } from './clipping-caps.ts';
import { createTieJointFocus } from './tie-joint-focus.ts';
import { projectedFrame, screenAxes, tieJointPose, type CameraPose } from './camera-framing.ts';

import type { SectionRangeLayout } from '../model/bracket.ts';
import type { PlanarJointSpec, JointType, TieJointSpec, TieJointType, ViewName } from '../model/joint-view-types.ts';

type SceneCamera = THREE.OrthographicCamera | THREE.PerspectiveCamera;
type CameraFrame = { target: THREE.Vector3; distance: number; zoom: number };
type CameraTransition = {
  from: CameraFrame;
  to: CameraFrame;
  direction: THREE.Vector3;
  rotation: THREE.Quaternion;
  startedAt: number;
};

// ---------- 剖切范围与辅助判断 ----------
// 轴测节点图的剖切范围（mm）：支架节点取最东一榀往西 400、往东 300；
// 檩条-组件 / 中压块取组件缝两侧各 100；边压块取阵列东边往西 100 到檩条端头外。
const LOCKED_VIEWS = new Set(['side', 'front', 'top', 'normal']);
const FOLLOW_VIEWS = new Set(['normal', 'joint-elev', 'joint-iso']);
const isTieJoint = (type: JointType): type is TieJointType => type === 'postTie' || type === 'purlinTie';
const sectionKey = (type: JointType) =>
  type === 'mod' || type === 'side' || type === 'splice' || type === 'clip' ? type : 'frame';

function sectionRange(layout: SectionRangeLayout, key: string) {
  if (key === 'clip') {
    const z = layout.zs.at(-1)!;
    return [z - JOINT_VIEW_CONFIG.section.clip, z + JOINT_VIEW_CONFIG.section.clip];
  }
  // 连接件长 240，两端各保留 60 的檩条；避开邻近榀的斜梁及檩托。
  if (key === 'splice') {
    const z = layout.cuts.positions.at(-1) || 0;
    const half = (layout.purlinConnector?.length || JOINT_VIEW_CONFIG.section.defaultConnectorLength) / 2 + JOINT_VIEW_CONFIG.section.spliceMargin;
    return [z - half, z + half];
  }
  if (key === 'mod') return [layout.gapZ - JOINT_VIEW_CONFIG.section.gap, layout.gapZ + JOINT_VIEW_CONFIG.section.gap];
  if (key === 'side') return [layout.arrW / 2 - JOINT_VIEW_CONFIG.section.end, layout.purlinLen / 2 + JOINT_VIEW_CONFIG.section.end];
  const z = layout.zs[layout.zs.length - 1];
  return [z - JOINT_VIEW_CONFIG.section.below, z + JOINT_VIEW_CONFIG.section.above];
}

/* 视角与显示：各视图下显示哪些部分、相机取景和切换动画 */

export function createView(context: RuntimeContext, scene: SceneController, materials: ViewerMaterials) {
  const { state, parameters, display, getBuiltState, track } = context;
  const { getScene, tryGetScene } = scene;
  const { M, ghostModules, ghostMat, applyPalette } = materials;
  const clipLo = new THREE.Plane(new V3(0, 0, 1), 0);
  const clipHi = new THREE.Plane(new V3(0, 0, -1), 0);

  let cam: SceneCamera | null = null;
  let tween: CameraTransition | null = null;
  let lastTiePose: CameraPose | null = null;

  // ---------- 显示开关与剖切 ----------

  function syncShadows(renderer: THREE.WebGLRenderer, sun: THREE.DirectionalLight, root: THREE.Group) {
    if (renderer.shadowMap.enabled === display.shadows) return;
    renderer.shadowMap.enabled = display.shadows;
    sun.castShadow = display.shadows;
    renderer.shadowMap.needsUpdate = true;
    // 阴影开关影响材质着色器，切换时刷新已有构件，无需重建模型。
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite || object instanceof THREE.Points)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.needsUpdate = true;
    });
  }

  function applyDimensionVisibility(d: NonNullable<typeof state.dims>, view: ViewName) {
    d.root.visible = display.dims;
    d.key.visible = view === '3d' || view === 'side';
    d.side.visible = view === 'side';
    d.ew.visible = view === '3d' || view === 'front' || view === 'top';
    d.normal.visible = view === 'normal';
    d.topCuts.visible = view === 'top';
    d.joint.visible = view.startsWith('joint');
    for (const joint of d.joint.children) {
      joint.visible = joint.userData.joint === state.jointType + state.jointSel;
      if (!joint.visible) continue;
      for (const child of joint.children) {
        if (child.userData.jointView) child.visible = child.userData.jointView === view;
      }
    }
    d.deep.visible = display.buried;
  }

  function applyClippingPlanes(
    renderer: THREE.WebGLRenderer,
    layout: NonNullable<typeof state.layout>,
    view: ViewName,
    tieJoint: boolean,
    sectioned: boolean,
    key: string,
  ) {
    if (tieJoint) {
      const sp = layout.jointSpecs?.[state.jointType][state.jointSel];
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
    ghostModules(view === 'normal' || (sectioned && state.jointType === 'clip') || (inJoint && mod), moduleOpacity);
    ghostMat(M.beam, inJoint && (state.jointType === 'top' || state.jointType === 'btop'), 0.42);
    // 檩条-檩条接头：连接件略透明，透出槽里的檩条接缝和螺栓
    ghostMat(M.purlinConnector, inJoint && state.jointType === 'splice', 0.6);

    const gm = M.ground;
    const wantTransparent = display.buried;
    if (gm.transparent !== wantTransparent) {
      gm.transparent = wantTransparent;
      gm.opacity = wantTransparent ? 0.5 : 1;
      gm.depthWrite = !wantTransparent;
      gm.needsUpdate = true;
    }
  }

  function updateTieJointContext(groups: NonNullable<typeof state.groups>, type: TieJointType | null) {
    const { renderer, root } = getScene();
    for (const caps of groups.tieCapCache?.values() ?? []) caps.visible = false;
    if (type) {
      groups.tieFocus ??= createTieJointFocus(groups, {
        track,
        supportMaterials: { postTie: [M.post, M.buried], purlinTie: [M.purlin] },
      });
      groups.tieCapCache ??= new Map();
      // 显示开关影响哪些实体会被裁切；尺寸/坡度/截面变化随模型重建清空缓存。
      const key = `${type}:${state.jointSel}:${display.bolts}:${display.buried}`;
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
    const { groups: g, dims: d, layout, view } = state;
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
    const tieJoint = inJoint && isTieJoint(state.jointType);
    const key = sectionKey(state.jointType);
    const mod = key !== 'frame' && key !== 'clip';
    const sideView = view === 'side';
    const sectioned = tieJoint || view === 'joint-iso' || (view === 'joint-elev' && (mod || state.jointType === 'clip' || !!layout.ew.i));

    g.buried.visible = display.buried;
    // 拉杆详图展示钢构连接，组件面板在檩条上方会遮住螺栓和槽口。
    g.modules.visible = display.modules && !tieJoint;
    g.postTies.visible = inJoint ? state.jointType === 'postTie' : display.postTies && !sideView;
    g.postTieHardware.visible = display.bolts;
    g.purlinTies.visible = inJoint ? state.jointType === 'purlinTie' : display.purlinTies && !sideView;
    g.purlinTieHardware.visible = display.bolts;
    g.hw.visible = display.bolts;
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
    updateTieJointContext(g, tieJoint && isTieJoint(state.jointType) ? state.jointType : null);
  }

  // ---------- 相机取景与包围盒 ----------

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

  function normalViewPose(canvas: HTMLCanvasElement): CameraPose {
    const { S, layout } = getBuiltState();
    const n = new V3(-S.s, S.c, 0);
    const dir = n.clone().normalize();
    const [right, up] = screenAxes(dir);
    const low = S.modStarts[0] - 500;
    const high = S.modStarts.at(-1)! + parameters.modL + 950;
    const halfW = layout.purlinLen / 2 + 350;
    const points: THREE.Vector3[] = [];
    for (const t of [low, high]) {
      for (const z of [-halfW, halfW]) {
        const q = S.along(t);
        points.push(V(q.x, q.y, z).addScaledVector(n, (S.hModBot + parameters.modT) * MM));
      }
    }
    const { target, size } = projectedFrame(points, right, up);
    const pw = Math.max(80, canvas.clientWidth - 128);
    const ph = Math.max(80, canvas.clientHeight - 144);
    const half = (Math.max(size.x / pw, size.y / ph) * canvas.clientHeight) / 2;
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
        for (const dz of [-JOINT_VIEW_CONFIG.spliceHalfDepth, JOINT_VIEW_CONFIG.spliceHalfDepth]) points.push(V(x, y, z + dz).applyMatrix4(W));
      }
    }
    for (const [x, y, ly, , pz] of sp.leaders) {
      points.push(V(x, y, pz ?? sp.zl ?? z).applyMatrix4(W));
      points.push(V(sp.anchorX, ly, sp.zl ?? z).applyMatrix4(W));
    }
    const { target, size } = projectedFrame(points, right, up);
    const scale = Math.max(0.05, Math.min(2.5, (cw - labelPx - JOINT_VIEW_CONFIG.horizontalMarginPx) / (size.x / MM), (ch - JOINT_VIEW_CONFIG.verticalMarginPx) / (size.y / MM)));
    target.addScaledVector(right, (labelPx / 2 / scale) * MM);
    return { target, dir, zoom: 1 / ((ch / 2 / scale) * MM) };
  }

  function framePose(name: ViewName): CameraPose {
    const { canvas, controls } = getScene();
    const { S, layout } = getBuiltState();
    if (name === 'normal') return normalViewPose(canvas);

    const sp = layout.jointSpecs?.[state.jointType][state.jointSel];
    if (!sp) throw new Error('连接节点尚未构建');
    if (sp.matrix) {
      const annotations = display.dims
        ? state.dims?.joint.children.find(group => group.userData.joint === state.jointType + state.jointSel)
        : undefined;
      lastTiePose = tieJointPose(sp, name, canvas, annotations, controls.maxZoom);
      return lastTiePose;
    }

    const zLast = layout.zs[layout.zs.length - 1];
    const frame = ['frame', 'clip'].includes(sectionKey(state.jointType));
    const z = sp.z === undefined ? zLast + S.sections.postF.f / 2 : sp.z;
    const W = ewMatrix(layout.ew, frame ? zLast : undefined); // 东西坡度：沿坡坐标 -> 世界
    const cw = canvas.clientWidth || 1;
    const ch = canvas.clientHeight || 1;
    const labelPx = cw < 520 ? 170 : 230;

    if (state.jointType === 'splice') return spliceJointPose(sp, name, z, W, cw, ch, labelPx);

    if (!frame && name === 'joint-iso' && sp.at) {
      const dir = new V3(-0.7, 1, 1).normalize();
      const [right] = screenAxes(dir);
      const scale = Math.max(0.2, Math.min(3, (cw - labelPx - JOINT_VIEW_CONFIG.horizontalMarginPx) / JOINT_VIEW_CONFIG.clampWidth, (ch - JOINT_VIEW_CONFIG.verticalMarginPx) / JOINT_VIEW_CONFIG.clampHeight));
      const target = V(sp.at.x, sp.at.y, z).applyMatrix4(W).addScaledVector(right, (labelPx / 2 / scale) * MM);
      return { target, dir, zoom: 1 / ((ch / 2 / scale) * MM) };
    }

    const xL = Math.min(sp.box[0], sp.box[1]);
    const xR = Math.max(sp.box[0], sp.box[1]);
    const [, , yB, yT] = sp.box;
    const scale = Math.max(0.2, Math.min(3, (cw - labelPx - JOINT_VIEW_CONFIG.horizontalMarginPx) / (xR - xL), (ch - JOINT_VIEW_CONFIG.verticalMarginPx) / (yT - yB)));
    const target = V((xL + xR) / 2 + (sp.labelSide * labelPx) / 2 / scale, (yB + yT) / 2 + 40 / scale, z).applyMatrix4(W);
    // 轴测一般偏向文字一侧；檩托在檩条下坡一侧，所以檩条-斜梁从下坡（南）一侧看
    const sx = state.jointType === 'clip' ? -1 : sp.labelSide;
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
    return state.layout && FOLLOW_VIEWS.has(state.view) ? framePose(state.view) : null;
  }

  function follow(oldPose: CameraPose | null) {
    const { controls } = getScene();
    if (!cam || !oldPose || !FOLLOW_VIEWS.has(state.view)) return;
    if (tween) {
      setView(state.view, true);
      return;
    }
    const np = framePose(state.view);
    const [r0, u0] = screenAxes(oldPose.dir);
    const [r1, u1] = screenAxes(np.dir);
    const off = controls.target.clone().sub(oldPose.target);
    // 垂直组件锁定了方向，跟着新的组件法向转；节点视图保留用户自己转过的方向
    const dir = state.view === 'normal' ? np.dir : cam.position.clone().sub(controls.target).normalize();
    if (state.view.startsWith('joint') && isTieJoint(state.jointType)) {
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
  function resizeTieJointView() {
    if (state.view.startsWith('joint') && isTieJoint(state.jointType)) follow(lastTiePose);
  }

  function setView(name: ViewName, instant = false) {
    const { ortho, persp } = getScene();
    state.view = name;
    lockView(LOCKED_VIEWS.has(name));
    applyVisibility();
    if (FOLLOW_VIEWS.has(name)) {
      const p = framePose(name);
      goTo(ortho, p.target.clone().addScaledVector(p.dir, 60), p.target, p.zoom, instant);
      return;
    }
    const { groups: { model }, dims: d } = getBuiltState();
    const objs = name === 'side' && display.dims && d ? [model, d.key, d.side] : [model];
    const box = visibleBox(objs);
    const ctr = box.getCenter(new V3());
    const size = box.getSize(new V3());
    const aspect = persp.aspect;
    if (name === '3d') {
      const dir = new V3(-1, 0.68, 1.25).normalize();
      const vf = persp.fov * DEG;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
      const dist = (size.length() / 2 / Math.sin(Math.min(vf, hf) / 2)) * (aspect < 1 ? 0.95 : 0.86);
      goTo(persp, ctr.clone().addScaledVector(dir, dist), ctr, null, instant);
      return;
    }
    let dir: THREE.Vector3;
    let w: number;
    let h: number;
    if (name === 'side') {
      dir = new V3(0, 0, 1);
      w = size.x + (display.dims ? 1.6 : 0); // 两端文字留边
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

  // 在正交和透视之间切换时，先匹配旧相机的朝向和画面比例。
  function matchProjection(previous: SceneCamera, next: SceneCamera, target: THREE.Vector3, fov: number) {
    const halfFovTangent = Math.tan((fov * DEG) / 2);
    const dir = previous.position.clone().sub(target).normalize();
    if (next instanceof THREE.OrthographicCamera) {
      next.zoom = 1 / (previous.position.distanceTo(target) * halfFovTangent);
      next.position.copy(target).addScaledVector(dir, 60);
    } else {
      next.position.copy(target).addScaledVector(dir, 1 / (previous.zoom * halfFovTangent));
    }
    next.updateProjectionMatrix();
    next.lookAt(target);
  }

  function goTo(next: SceneCamera, pos: THREE.Vector3, target: THREE.Vector3, zoom: number | null, instant: boolean) {
    const { persp, controls } = getScene();
    if (!cam) return;
    if (next !== cam) {
      matchProjection(cam, next, controls.target, persp.fov);
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
    const fromOffset = cam.position.clone().sub(controls.target);
    const toOffset = pos.clone().sub(target);
    const direction = fromOffset.clone().normalize();
    tween = {
      from: { target: controls.target.clone(), distance: fromOffset.length(), zoom: cam.zoom },
      to: { target: target.clone(), distance: toOffset.length(), zoom: zoom || cam.zoom },
      direction,
      rotation: new THREE.Quaternion().setFromUnitVectors(direction, toOffset.normalize()),
      startedAt: performance.now(),
    };
  }

  function stepTween(now: number) {
    const { controls } = getScene();
    if (!tween || !cam) return;
    const { from, to, direction, rotation, startedAt } = tween;
    const progress = Math.min(1, (now - startedAt) / 700);
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    const turn = new THREE.Quaternion().slerp(rotation, eased);
    const distance = from.distance + (to.distance - from.distance) * eased;
    controls.target.lerpVectors(from.target, to.target, eased);
    cam.position.copy(direction).applyQuaternion(turn).multiplyScalar(distance).add(controls.target);
    if (cam instanceof THREE.OrthographicCamera) {
      cam.zoom = from.zoom * (to.zoom / from.zoom) ** eased;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(controls.target);
    if (progress >= 1) {
      tween = null;
      controls.update();
    }
  }

  function cancelTween() {
    tween = null;
  }

  function initView() {
    const { persp, controls } = getScene();
    cam = persp;
    tween = null;
    controls.addEventListener('start', cancelTween);
  }

  function disposeView() {
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

  function getCamera() {
    if (!cam) throw new Error('视图相机尚未初始化');
    return cam;
  }

  return { initView, disposeView, setView, applyVisibility, placeSun, savePose, follow, tick, sectionRange, getCamera, resizeTieJointView };
}

export type ViewController = ReturnType<typeof createView>;
