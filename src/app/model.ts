import { createPartOptions } from '../model/part-options.ts';
import { braceConnectorPlates } from '../domain/specs/brace-connector-spec.ts';
import { createSectionGeometry, createSectionCapGeometry } from '../model/geometry/section-geometry.ts';
import { createBracket } from '../model/bracket.ts';
import type { MemberSections } from '../domain/design-types.ts';
import { MM, ewPlace } from '../model/geometry/core.ts';
import { solve, layoutEW } from '../domain/solve.ts';
import * as THREE from 'three';
import type { RuntimeContext } from '../viewer/runtime-context.ts';
import type { SceneController } from '../viewer/scene.ts';
import type { ViewerMaterials } from '../viewer/materials.ts';
import type { ViewController } from '../viewer/view.ts';
import type { DimensionController } from '../viewer/dims.ts';

type Bracket = ReturnType<typeof createBracket>;

/** 绑定到一个设计器，同一轮重建依次完成求解、构件装配、标注与取景。 */
export function createModel(context: RuntimeContext, scene: SceneController, materials: ViewerMaterials, view: ViewController, dimensions: DimensionController) {
  const { parameters, state, track, disposables, labels } = context;
  const { M, modMats } = materials;

  function clearDynamic() {
    for (const resource of disposables) resource.dispose();
    disposables.length = 0;
    labels.length = 0;
    const root = scene.tryGetScene()?.root;
    while (root?.children.length) root.remove(root.children[0]);
  }

  // 地面：过前柱脚，按南北坡度绕 z 轴倾斜，再按东西坡度沿 z 剪切
  function buildGround(solution: Bracket['solution'], layout: Bracket['layout']) {
    const groundSize = Math.max(40, layout.arrW * MM + 24);
    const geometry = track(new THREE.PlaneGeometry(groundSize, groundSize));
    geometry.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(geometry, M.ground);
    ground.position.set(solution.xf * MM, 0, 0);
    ground.rotation.z = Math.atan(solution.sp);
    ground.receiveShadow = true;
    M.ground.map?.repeat.set(groundSize, groundSize);
    ground.updateMatrix();
    ground.userData.levelMatrix = ground.matrix.clone();
    ewPlace(ground, layout.ew);
    scene.getScene().root.add(ground);
    return ground;
  }

  // 先挂载本轮模型，再按新几何生成标注并更新视图。
  function displayBracket(bracket: Bracket) {
    const { solution, layout, groups } = bracket;
    state.S = solution;
    state.layout = layout;

    if (state.jointType === 'splice' && (!layout.cuts.positions.length || !layout.purlinConnector)) state.jointType = 'mod';
    scene.getScene().root.add(groups.model);

    state.groups = { ...groups, ground: buildGround(solution, layout) };
    dimensions.build();
    // 拉杆可能被取消布置或因高度不足而消失；只允许取景到实际生成的节点。
    if (['postTie', 'purlinTie'].includes(state.jointType)) {
      const specs = layout.jointSpecs?.[state.jointType];
      if (!specs?.[state.jointSel]) {
        const availableSide = specs?.findIndex(Boolean) ?? -1;
        if (availableSide >= 0) state.jointSel = availableSide;
        else state.jointType = 'foot';
      }
    }
    view.applyVisibility();
    view.placeSun();
  }

  function build(sections: MemberSections) {
    // 先记下旧几何下的取景，重建后让垂直组件 / 节点视图跟着新几何走
    const oldPose = view.savePose();
    const oldJoint = state.jointType + state.jointSel;
    if (parameters.fix !== 'clamp' && state.jointType === 'side') state.jointType = 'mod';   // 改回螺栓固定就没有边压块了
    clearDynamic();
    const partOptions = createPartOptions({
      sections,
      materials: M,
      connections: { plates: braceConnectorPlates },
      geometry: { createSectionGeometry, createSectionCapGeometry, modMats },
      track,
    });
    const bracket = createBracket(parameters, {
      sections,
      partOptions,
      solvers: { solve, layoutEW },
      sectionRange: view.sectionRange,
    });
    displayBracket(bracket);
    if (state.view.startsWith('joint') && oldJoint !== state.jointType + state.jointSel) view.setView(state.view, true);
    else view.follow(oldPose);
  }

  return { build, clearDynamic };
}
