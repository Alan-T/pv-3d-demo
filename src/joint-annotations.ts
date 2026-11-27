import * as THREE from 'three';
import { V, V3, MM, ewPlace, track } from './core.ts';
import { dimensionMaterials, DimSet } from './dimension-graphics.ts';
import type { JointSpecs, JointType, PlanarJointSpec, TieJointSpec } from './joint-view-types.ts';
import type { EWLayout } from './solve.ts';

type JointSpec = PlanarJointSpec | TieJointSpec;

// 全局剖切也会裁掉随镜头转向的文字精灵。仅为本节点的标注使用独立材质，
// 去掉片元剖切，保留模型剖切和其他节点的材质设置。
function keepAnnotationsUnclipped(group: THREE.Group) {
  const materials = new Map<THREE.Material, THREE.Material>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Line || object instanceof THREE.Sprite) || Array.isArray(object.material)) return;
    const original: THREE.Material = object.material;
    if (!materials.has(original)) {
      const material = track(original.clone());
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '');
      };
      material.customProgramCacheKey = () => 'unclipped-joint-annotation';
      materials.set(original, material);
    }
    object.material = materials.get(original)!;
  });
}

function addLeader(segments: DimSet, tip: THREE.Vector3, anchor: THREE.Vector3) {
  const axis = anchor.clone().sub(tip).normalize().multiplyScalar(0.012);
  const wing = new V3(-axis.y, axis.x, 0).multiplyScalar(0.4);
  segments.seg(tip, anchor);
  segments.seg(tip, tip.clone().add(axis).add(wing));
  segments.seg(tip, tip.clone().add(axis).sub(wing));
}

function addJointLeaders(leaders: DimSet, spec: JointSpec, labelZ: number) {
  for (const [x, y, labelY, text, z = labelZ, elevationTip] of spec.leaders) {
    const tip = V(x, y, z);
    const anchor = V(spec.anchorX, labelY, labelZ);
    if (elevationTip) {
      // 正视和轴测分别指向螺栓头和螺母，两个视角共用一个文字精灵。
      for (const [view, viewTip] of [['joint-elev', V(...elevationTip)], ['joint-iso', tip]] as const) {
        const arrow = new DimSet();
        addLeader(arrow, viewTip, anchor);
        const group = arrow.finish(dimensionMaterials.line);
        group.userData.jointView = view;
        leaders.group.add(group);
      }
    } else {
      addLeader(leaders, tip, anchor);
    }
    leaders.label(text, anchor, 'out', 13).userData.outside = {
      at: anchor,
      dir: new V3(spec.labelSide, 0, 0),
      screenSide: spec.matrix ? spec.labelSide : undefined,
    };
  }
}

function drawJoint(spec: JointSpec, defaultLabelZ: number) {
  const labels = new DimSet();
  const centerLines = new DimSet();
  const labelZ = spec.zl ?? defaultLabelZ;
  addJointLeaders(labels, spec, labelZ);
  for (const [x1, y1, x2, y2, lineZ = labelZ] of spec.lines) {
    centerLines.seg(V(x1, y1, lineZ), V(x2, y2, lineZ), true);
  }

  // 拉杆局部 z=0 是安装面，尺寸界线从实际孔心和杆端起算。
  const dimZ = spec.matrix ? 0 : labelZ;
  for (const [x1, y1, x2, y2, ox, oy, text] of spec.dims ?? []) {
    const offset = new V3(ox * MM, oy * MM, 0);
    const { A, B, label } = labels.dim(V(x1, y1, dimZ), V(x2, y2, dimZ), offset, text, 'out', 13, 0.2);
    label.userData.outside = { at: A.clone().add(B).multiplyScalar(0.5), dir: new V3(Math.sign(ox), 0, 0) };
  }
  const group = labels.finish(dimensionMaterials.line);
  group.add(centerLines.finish(dimensionMaterials.line, dimensionMaterials.center));
  return group;
}

export function renderJointAnnotations(specs: JointSpecs, defaultLabelZ: number, layout: EWLayout) {
  const annotations = new THREE.Group();
  const eastFrameZ = layout.zs[layout.zs.length - 1];
  for (const type of Object.keys(specs) as JointType[]) {
    specs[type].forEach((spec, side) => {
      if (!spec) return;
      const group = drawJoint(spec, defaultLabelZ);
      if (type === 'splice' || spec.matrix) keepAnnotationsUnclipped(group);
      group.userData.joint = type + side;
      if (spec.matrix) {
        group.matrixAutoUpdate = false;
        group.matrix.copy(spec.matrix);
      } else {
        // 支架节点跟随最东一榀，组件夹具与檩条接头跟随整根檩条顺坡。
        const followsPurlin = type === 'mod' || type === 'side' || type === 'splice';
        ewPlace(group, layout.ew, followsPurlin ? undefined : eastFrameZ);
      }
      annotations.add(group);
    });
  }
  return annotations;
}
