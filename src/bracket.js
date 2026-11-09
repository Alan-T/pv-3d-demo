import { BraceConnectorPart } from './parts/brace-connector.js';
import { PostPart } from './parts/post.js';
import { PostTiePart } from './parts/post-tie.js';
import { calculatePostTies } from './post-tie-layout.js';
import { BeamPart } from './parts/beam.js';
import { BracePart } from './parts/brace.js';
import { PurlinPart } from './parts/purlin.js';
import { ModulePart } from './parts/module.js';
import { ClampPart } from './parts/clamp.js';
import { BoltsPart } from './parts/bolts.js';
import * as THREE from '../vendor/three.module.js';
import { V3, MM, ewPlace } from './core.js';

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


/** Build a support without attaching it to a scene or changing page state.
 * Component builders receive a per-build context. They must use the supplied
 * material/resource lifecycle consistently; the current page adapters retain
 * their existing shared material and geometry configuration.
 */
export function createBracket(parameters, { sections, partOptions, solvers, sectionRange }) {
  const P = { ...parameters };

  const beam = new BeamPart(partOptions.beam);

  const purlin = new PurlinPart(partOptions.purlin);
  const module = new ModulePart(partOptions.module);
  const clamp = new ClampPart(partOptions.clamp);
  const boltPart = new BoltsPart(partOptions.bolts);
  const { solve, layoutEW } = solvers;
  const viewSectionRange = sectionRange;
  const S = solve(P), layout = layoutEW(P);
  const connector = new BraceConnectorPart(partOptions.brace.braceConnector);
  const O = S.outer;
  layout.joints = [
    connector.braceJoint(S.connections[0], S.tFp, O && O.toFp),
    connector.braceJoint(S.connections[1], S.tRp, O && O.toRp),
  ];
  const postOptions = partOptions.post;
  const frontPost = new PostPart({ section: postOptions.postFSection, material: postOptions.postMaterial,
    buriedMaterial: postOptions.buriedMaterial, x: S.xf, bottom: S.botF, top: S.topF, ground: S.gy(S.xf),
    createSectionGeometry: postOptions.createSectionGeometry, track: postOptions.track });
  const rearPost = new PostPart({ section: postOptions.postRSection, material: postOptions.postMaterial,
    buriedMaterial: postOptions.buriedMaterial, x: S.xr, bottom: S.botR, top: S.topR, ground: S.gy(S.xr),
    createSectionGeometry: postOptions.createSectionGeometry, track: postOptions.track });
  const braceOptions = partOptions.brace;
  const braceConfig = { material: braceOptions.braceMaterial, createSectionGeometry: braceOptions.createSectionGeometry, track: braceOptions.track };
  const frontBrace = new BracePart({ ...braceConfig, section: braceOptions.braceFSection, node: layout.joints[0] });
  const rearBrace = new BracePart({ ...braceConfig, section: braceOptions.braceRSection, node: layout.joints[1] });
  const frontOuterBrace = O ? new BracePart({ ...braceConfig, section: braceOptions.braceOFSection, node: layout.joints[0].o }) : null;
  const rearOuterBrace = O ? new BracePart({ ...braceConfig, section: braceOptions.braceORSection, node: layout.joints[1].o }) : null;
  const instances = { frontPost, rearPost, frontBrace, rearBrace, frontOuterBrace, rearOuterBrace };
  const g = {
    model: new THREE.Group(),
    buried: new THREE.Group(),
    modules: new THREE.Group(),
    hw: new THREE.Group(),          // 连接件：螺栓、连接板、檩托
    slope: new THREE.Group(),       // 顺坡的檩条及其剖切封口
    hwSlope: new THREE.Group(),     // 顺坡的连接件：压块、组件螺栓
    postTies: new THREE.Group(),     // 已按实际榀位计算的跨间拉杆，不再变换
  };
  g.model.add(g.buried, g.modules, g.hw, g.slope, g.postTies);
  g.postTies.userData.slope = true;
  g.hw.add(g.hwSlope);
  // 东西坡度：各构件先按沿坡坐标搭，再换到坡上（见 ewMatrix）
  for (const k of ['modules', 'slope', 'hwSlope']) { g[k].userData.slope = true; ewPlace(g[k], layout.ew); }

  // 各构件共用的构建上下文：u 沿坡向上、n 垂直斜梁向上；zw 是立柱腹板所在平面（框架平面东侧），
  // zBeamWeb 是斜梁腹板内表面（相对榀位 z0），柱顶、撑顶螺栓的螺母在这一侧
  const zw = sections.post.f / 2;
  const bolts = boltPart.collector(P.modT);
  const c = {
    P, S, layout, bolts, ...g,
    u: new V3(S.c, S.s, 0), n: new V3(-S.s, S.c, 0),
    zw, zBeamWeb: zw + sections.beam.t,
  };
  frontPost.build(c);
  rearPost.build(c);
  beam.build(c);
  frontBrace.build(c);
  rearBrace.build(c);
  frontOuterBrace?.build(c);
  rearOuterBrace?.build(c);
  for (const z of layout.zs) for (const joint of layout.joints) connector.build(c, joint, z);
  const clip = purlin.build(c);
  module.build(c);
  const clamps = P.fix === 'clamp' ? clamp.build(c) : null;
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
      purlin.cap(c, z, pc);
      module.cap(c, z, mc);
    }
  }
  if (layout.ew.i) liftFrames(g.model, layout);

  layout.postTies = calculatePostTies(P, S, layout);
  // 拉杆孔位已经是世界坐标；在榀位抬高之后独立生成紧固件，避免重复施加坡度。
  const tieBolts = boltPart.collector(P.modT);
  g.postTieHardware = new THREE.Group();
  g.postTies.add(g.postTieHardware);
  for (const row of layout.postTies) {
    if (!row.valid && row.enabled.some(Boolean)) S.warn.push(`${row.rear ? '后' : '前'}排立柱拉杆安装高度不足，未生成拉杆，请调整柱高或斜撑下节点高度`);
    const part = new PostTiePart({ ...partOptions.postTie,
      postSection: row.rear ? sections.postR : sections.postF });
    part.build({ row, parent: g.postTies, bolts: tieBolts });
    instances[row.rear ? 'rearPostTie' : 'frontPostTie'] = part;
  }
  layout.counts.postTieBolts = tieBolts.flush(g.postTieHardware, g.postTieHardware).m12;
  layout.counts.m12 += layout.counts.postTieBolts;

  return { model: g.model, groups: g, solution: S, layout, instances };
}
