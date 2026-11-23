import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { getPurlinClipSpec } from '../src/purlin-clip-spec.js';
import { PurlinClipPart } from '../src/parts/purlin-clip.js';
import { BoltsPart } from '../src/parts/bolts.js';
import { FIX, CLAMP, JOINT, PRESETS, PURLIN_CLIP_SPECS, getPresetParameters } from '../src/config.js';
import { solve, layoutEW } from '../src/solve.js';

// 实例矩阵使用 Float32，米制坐标允许 0.002 mm 的数值误差。
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 2e-6, `${message}: ${actual} / ${expected}`);

test('檩托规格保留四个尺寸，预设可用，未知名称不回退', () => {
  const expected = [[100, 63, 6, 50], [90, 56, 5, 50], [75, 50, 5, 50]];
  PURLIN_CLIP_SPECS.forEach((name, index) => {
    const spec = getPurlinClipSpec(name);
    assert.deepEqual([spec.height, spec.base, spec.t, spec.width], expected[index]);
    spec.t = 999;
    assert.equal(getPurlinClipSpec(name).t, expected[index][2], '修改实例不能污染规格库');
  });
  for (const preset of Object.values(PRESETS)) {
    for (const layout of preset.layouts) assert.ok(getPurlinClipSpec(layout.purlinClip));
  }
  assert.equal(getPurlinClipSpec('L80*64*4*50'), null);
});

test('三种檩托实体和安装位置正确，螺栓头下平垫随板厚贴紧檩托', () => {
  const parameters = getPresetParameters(PRESETS.A);
  const S = solve(parameters), layout = layoutEW(parameters);
  const u = new THREE.Vector3(S.c, S.s, 0), n = new THREE.Vector3(-S.s, S.c, 0);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const washerMaterial = new THREE.MeshBasicMaterial();
  try {
    for (const name of PURLIN_CLIP_SPECS) {
      const CLIP = getPurlinClipSpec(name), resources = [], calls = [], hw = new THREE.Group();
      const track = geometry => (resources.push(geometry), geometry);
      try {
        const part = new PurlinClipPart({ beamSection: FIX.beam, purlinSection: FIX.purlin, clipMaterial: material, CLIP, track });
        const count = part.build({ S, layout, zw: FIX.postF.f / 2, u, n, hw, bolts: { add: (kind, point, axis, up) => calls.push({ kind, point, axis, up }) } });
        assert.equal(count, layout.zs.length * S.purlins.length);
        const instance = hw.children[0];
        instance.geometry.computeBoundingBox();
        const box = instance.geometry.boundingBox;
        close(box.max.x, CLIP.base * .001, '底边宽');
        close(box.max.y, CLIP.height * .001, '立边高');
        const matrix = new THREE.Matrix4(); instance.getMatrixAt(0, matrix);
        assert.ok(matrix.determinant() > 0, '安装坐标保持右手系');
        close(new THREE.Vector3(0, 0, 0).applyMatrix4(matrix).distanceTo(new THREE.Vector3(0, 0, 1).applyMatrix4(matrix)), .05, '檩托长度');
        const mesh = new THREE.Mesh(instance.geometry, material);
        mesh.matrixAutoUpdate = false; mesh.matrix.copy(matrix); mesh.updateMatrixWorld(true);
        const boltPart = new BoltsPart({ beamSection: FIX.beam, purlinSection: FIX.purlin,
          boltSteelMaterial: material, washerMaterial, slotMaterial: material, CLAMP, CLIP, JOINT, track });
        for (const kind of ['clip', 'clipWeb']) {
          const call = calls.find(item => item.kind === kind);
          const matingThickness = kind === 'clip' ? FIX.beam.t : FIX.purlin.t;
          const point = call.point.clone().applyMatrix4(matrix.clone().invert());
          close(point.z * CLIP.width * .001, CLIP.width * .001 / 2, '螺栓位于长度中线');
          if (kind === 'clip') close(point.x, CLIP.base * .001 / 2, '底边螺栓居中');
          else close(point.y, .05, '立边孔高');
          const ray = new THREE.Raycaster(call.point, call.axis.clone().negate(), 0, .03);
          const hits = ray.intersectObject(mesh);
          assert.ok(hits.length >= 2, `${name} ${kind}: ${JSON.stringify({ point: point.toArray(), hits: hits.map(hit => hit.distance) })}`);
          close(hits[0].distance, matingThickness * .001, '檩托贴合面');
          close(hits.at(-1).distance, (matingThickness + CLIP.t) * .001, '檩托外表面');
          const bolts = boltPart.collector(parameters.modT), group = new THREE.Group();
          bolts.add(kind, new THREE.Vector3(), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
          assert.equal(bolts.flush(group, group).m12, 1);
          const headWasher = group.children.find(child => {
            child.geometry.computeBoundingBox();
            return child.material === washerMaterial && child.geometry.boundingBox.max.z < 0;
          });
          assert.ok(headWasher);
          close(headWasher.geometry.boundingBox.max.z, -(matingThickness + CLIP.t) * .001, '头下平垫贴紧檩托');
        }
      } finally { resources.forEach(geometry => geometry.dispose()); }
    }
  } finally { material.dispose(); washerMaterial.dispose(); }
});
