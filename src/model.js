import { root } from './scene.js';
import { M } from './materials.js';
import { FIX, P } from './config.js';
import { V3, MM, track, ewPlace, ewMatrix, shared } from './core.js';
import { build as clampBuild } from './parts/clamp.js';
import { build as moduleBuild, cap as moduleCap } from './parts/module.js';
import { build as purlinBuild, cap as purlinCap } from './parts/purlin.js';
import { build as beamBuild } from './parts/beam.js';
import { build as postBuild } from './parts/post.js';
import { collector as boltsCollector } from './parts/bolts.js';
import { joints as braceJoints, build as braceBuild } from './parts/brace.js';
import { solve, layoutEW } from './solve.js';
import { update as panelUpdate } from './panel.js';
import { build as overlayBuild } from './overlay.js';
import { build as dimsBuild } from './dims.js';
import { savePose as viewSavePose, sectionRange as viewSectionRange, applyVisibility as viewApplyVisibility, placeSun as viewPlaceSun, follow as viewFollow } from './view.js';
import * as THREE from '../vendor/three.module.js';

const params = P;

/* 整体重建：改任何参数都重新求几何、依次搭各构件，再画标注、刷新视图和面板 */

function clearDynamic() {
  for (const d of shared.disposables) d.dispose();
  shared.disposables.length = 0;
  shared.labels.length = 0;
  while (root.children.length) root.remove(root.children[0]);
}

// 地面：过前柱脚，按南北坡度绕 z 轴倾斜，再按东西坡度沿 z 剪切
function buildGround(S, layout) {
  const gSize = Math.max(40, layout.arrW * MM + 24);
  const gg = track(new THREE.PlaneGeometry(gSize, gSize));
  gg.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(gg, M.ground);
  ground.position.set(S.xf * MM, 0, 0);
  ground.rotation.z = Math.atan(S.sp);
  ground.receiveShadow = true;
  M.ground.map.repeat.set(gSize, gSize);
  ewPlace(ground, layout.ew);
  root.add(ground);
  return ground;
}

// 东西坡度：各榀的构件（立柱、斜梁、斜撑、连接板、檩托、M12 螺栓）按离得最近的榀位整体平移到坡上；
// 顺坡剪切的分组（userData.slope）跳过
function liftFrames(obj, layout) {
  const { zs, ew } = layout, m = new THREE.Matrix4(), p = new V3();
  const lift = (v) => {
    const z = v.z / MM;
    const z0 = zs.reduce((a, q) => (Math.abs(q - z) < Math.abs(a - z) ? q : a));
    v.y += z0 * ew.sa * MM;
    v.z += z0 * (ew.ca - 1) * MM;
  };
  const visit = (o) => {
    if (o.userData.slope) return;
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        lift(p.setFromMatrixPosition(m));
        o.setMatrixAt(i, m.setPosition(p));
      }
      o.instanceMatrix.needsUpdate = true;
    } else if (o.isMesh) {
      if (o.matrixAutoUpdate) lift(o.position);
      else { lift(p.setFromMatrixPosition(o.matrix)); o.matrix.setPosition(p); }
    }
    for (const ch of o.children) visit(ch);
  };
  visit(obj);
}

export function build() {
  const st = shared.state, P = params;
  // 先记下旧几何下的取景，重建后让垂直组件 / 节点视图跟着新几何走
  const oldPose = viewSavePose();
  if (P.fix !== 'clamp' && st.jointType === 'side') st.jointType = 'mod';   // 改回螺栓固定就没有边压块了
  clearDynamic();
  const S = (st.S = solve(P));
  const layout = (st.layout = layoutEW(P));
  if (st.jointType === 'splice' && !layout.cuts.positions.length) st.jointType = 'mod';
  layout.joints = braceJoints(S);

  const g = (st.groups = {
    model: new THREE.Group(),
    buried: new THREE.Group(),
    modules: new THREE.Group(),
    hw: new THREE.Group(),          // 连接件：螺栓、连接板、檩托
    slope: new THREE.Group(),       // 顺坡的檩条及其剖切封口
    hwSlope: new THREE.Group(),     // 顺坡的连接件：压块、组件螺栓
  });
  g.model.add(g.buried, g.modules, g.hw, g.slope);
  g.hw.add(g.hwSlope);
  // 东西坡度：各构件先按沿坡坐标搭，再换到坡上（见 ewMatrix）
  for (const k of ['modules', 'slope', 'hwSlope']) { g[k].userData.slope = true; ewPlace(g[k], layout.ew); }

  // 各构件共用的构建上下文：u 沿坡向上、n 垂直斜梁向上；zw 是立柱腹板所在平面（框架平面东侧），
  // zBeamWeb 是斜梁腹板内表面（相对榀位 z0），柱顶、撑顶螺栓的螺母在这一侧
  const zw = FIX.post.f / 2;
  const bolts = boltsCollector(P.modT);
  const c = {
    P, S, layout, bolts, ...g,
    u: new V3(S.c, S.s, 0), n: new V3(-S.s, S.c, 0),
    zw, zBeamWeb: zw + FIX.beam.t,
  };
  postBuild(c);
  beamBuild(c);
  braceBuild(c);
  const clip = purlinBuild(c);
  moduleBuild(c);
  const clamps = P.fix === 'clamp' ? clampBuild(c) : null;
  layout.counts = Object.assign({ clip, clamps }, bolts.flush(g.hw, g.hwSlope));

  // 轴测节点图剖切面的封口：被切开的檩条、组件补画截面，只在剖切时显示。支架节点、檩条-组件、边压块三种剖切范围各一套。
  // 略往保留的一侧挪 0.5，免得被剖切面自己裁掉；组件的封口放进组件分组，跟着“光伏组件”开关
  g.caps = [];
  for (const key of ['frame', 'mod', 'side', 'splice', 'clip']) {
    const [lo, hi] = viewSectionRange(layout, key);
    const pc = new THREE.Group(), mc = new THREE.Group();
    pc.userData.section = mc.userData.section = key;
    g.slope.add(pc);
    g.modules.add(mc);
    g.caps.push(pc, mc);
    for (const z of [lo + 0.5, hi - 0.5]) {
      purlinCap(c, z, pc);
      moduleCap(c, z, mc);
    }
  }
  if (layout.ew.i) liftFrames(g.model, layout);
  root.add(g.model);

  g.ground = buildGround(S, layout);
  dimsBuild();
  overlayBuild();
  viewApplyVisibility();
  viewPlaceSun();
  panelUpdate();
  viewFollow(oldPose);
}
