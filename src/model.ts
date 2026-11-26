import { createPartOptions } from './part-options.ts';
import { braceConnectorPlates } from './brace-connector-spec.ts';
import { modMats } from './materials.ts';
import { createSectionGeometry, createSectionCapGeometry } from './section-geometry.ts';
import { createBracket } from './bracket.ts';
import { getScene, tryGetScene } from './scene.ts';
import { M } from './materials.ts';
import { CLAMP, FIX, P } from './config.ts';
import { MM, track, ewPlace, shared } from './core.ts';
import { solve, layoutEW } from './solve.ts';
import { build as dimsBuild } from './dims.ts';
import { savePose as viewSavePose, sectionRange as viewSectionRange, applyVisibility as viewApplyVisibility, placeSun as viewPlaceSun, follow as viewFollow, setView as viewSetView } from './view.ts';
import * as THREE from 'three';

/* 整体重建：改任何参数都重新求几何、依次搭各构件，再画标注、刷新视图和面板 */

export function clearDynamic() {
  for (const d of shared.disposables) d.dispose();
  shared.disposables.length = 0;
  shared.labels.length = 0;
  const root = tryGetScene()?.root;
  while (root?.children.length) root.remove(root.children[0]);
}

// 地面：过前柱脚，按南北坡度绕 z 轴倾斜，再按东西坡度沿 z 剪切
type Bracket = ReturnType<typeof createBracket>;

function buildGround(S: Bracket['solution'], layout: Bracket['layout']) {
  const gSize = Math.max(40, layout.arrW * MM + 24);
  const gg = track(new THREE.PlaneGeometry(gSize, gSize));
  gg.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(gg, M.ground);
  ground.position.set(S.xf * MM, 0, 0);
  ground.rotation.z = Math.atan(S.sp);
  ground.receiveShadow = true;
  M.ground.map?.repeat.set(gSize, gSize);
  ground.updateMatrix();
  ground.userData.levelMatrix = ground.matrix.clone();
  ewPlace(ground, layout.ew);
  getScene().root.add(ground);
  return ground;
}

// Commit the build result before dimensions and views read the page state.
function displayBracket(bracket: Bracket, state: typeof shared.state) {
  const { solution: S, layout, groups: g } = bracket;
  state.S = S;
  state.layout = layout;

  if (state.jointType === 'splice' && (!layout.cuts.positions.length || !layout.purlinConnector)) state.jointType = 'mod';
  getScene().root.add(g.model);

  state.groups = { ...g, ground: buildGround(S, layout) };
  dimsBuild();
  // 拉杆可能被取消布置或因高度不足而消失；只允许取景到实际生成的节点。
  if (['postTie', 'purlinTie'].includes(state.jointType)) {
    const specs = layout.jointSpecs?.[state.jointType];
    if (!specs?.[state.jointSel]) {
      const availableSide = specs?.findIndex(Boolean) ?? -1;
      if (availableSide >= 0) state.jointSel = availableSide;
      else state.jointType = 'foot';
    }
  }
  viewApplyVisibility();
  viewPlaceSun();
}

export function build() {
  const state = shared.state;
  // 先记下旧几何下的取景，重建后让垂直组件 / 节点视图跟着新几何走
  const oldPose = viewSavePose();
  const oldJoint = state.jointType + state.jointSel;
  if (P.fix !== 'clamp' && state.jointType === 'side') state.jointType = 'mod';   // 改回螺栓固定就没有边压块了
  clearDynamic();
  const partOptions = createPartOptions({
    sections: FIX,
    materials: M,
    connections: { plates: braceConnectorPlates, CLAMP },
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
  if (state.view.startsWith('joint') && oldJoint !== state.jointType + state.jointSel) viewSetView(state.view, true);
  else viewFollow(oldPose);
}
