import { createPartOptions } from './part-options.js';
import { JOINT, DBL, CLIP, CLAMP } from './config.js';
import { modMats } from './materials.js';
import { createSectionGeometry, createSectionCapGeometry } from './section-geometry.js';
import { createBracket } from './bracket.js';
import { root } from './scene.js';
import { M } from './materials.js';
import { FIX, P } from './config.js';
import { MM, track, ewPlace, shared } from './core.js';
import { solve, layoutEW } from './solve.js';
import { update as panelUpdate } from './panel.js';
import { build as dimsBuild } from './dims.js';
import { savePose as viewSavePose, sectionRange as viewSectionRange, applyVisibility as viewApplyVisibility, placeSun as viewPlaceSun, follow as viewFollow } from './view.js';
import * as THREE from '../vendor/three.module.js';

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
  ground.updateMatrix();
  ground.userData.levelMatrix = ground.matrix.clone();
  ewPlace(ground, layout.ew);
  root.add(ground);
  return ground;
}

// Commit the build result before dimensions and views read the page state.
function displayBracket(bracket, state) {
  const { solution: S, layout, groups: g } = bracket;
  state.S = S;
  state.layout = layout;
  state.groups = g;
  if (state.jointType === 'splice' && !layout.cuts.positions.length) state.jointType = 'mod';
  root.add(g.model);

  g.ground = buildGround(S, layout);
  dimsBuild();
  viewApplyVisibility();
  viewPlaceSun();
  panelUpdate();
}

export function build() {
  const state = shared.state;
  // 先记下旧几何下的取景，重建后让垂直组件 / 节点视图跟着新几何走
  const oldPose = viewSavePose();
  if (P.fix !== 'clamp' && state.jointType === 'side') state.jointType = 'mod';   // 改回螺栓固定就没有边压块了
  clearDynamic();
  const partOptions = createPartOptions({
    sections: FIX,
    materials: M,
    connections: { JOINT, DBL, CLIP, CLAMP },
    geometry: { createSectionGeometry, createSectionCapGeometry, modMats },
    track,
  });
  const bracket = createBracket(P, {
    sections: FIX,
    partOptions,
    solvers: { solve, layoutEW },
    sectionRange: viewSectionRange,
  });
  displayBracket(bracket, state);
  viewFollow(oldPose);
}
