import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { getClampSpec } from '../src/domain/specs/clamp-spec.ts';
import { FIX, PRESETS } from '../src/config.ts';
import { getPurlinClipSpec } from '../src/domain/specs/purlin-clip-spec.ts';
import { resolveMemberSections } from '../src/domain/specs/section-spec.ts';
import { ClampPart } from '../src/model/parts/clamp.ts';
import { BoltsPart } from '../src/model/parts/bolts.ts';

const thicknessRows = [
  { modT: 30, edgeHeight: 35, boltLength: 30 },
  { modT: 33, edgeHeight: 38, boltLength: 35 },
  { modT: 35, edgeHeight: 40, boltLength: 35 },
];
const lengths = [40, 50, 60, 80];

test('12 种压块组合对应的中压块、边压块及螺栓规格', () => {
  for (const { modT, edgeHeight, boltLength } of thicknessRows) {
    for (const length of lengths) {
      const spec = getClampSpec(modT, length);
      assert.equal(spec.mid.name, `20-L${length}×Φ9`);
      assert.equal(spec.edge.name, `${edgeHeight}-L${length}×Φ9`);
      assert.equal(spec.bolt.name, `M8×${boltLength}`);
    }
  }
});

function closeMm(metres, mm) {
  assert.ok(Math.abs(metres * 1000 - mm) < 0.002, `期望 ${mm} mm，实际 ${metres * 1000} mm`);
}

test('压块实体的长度、高度和通孔与螺栓轴线匹配，M8 螺杆按公称长度绘制', t => {
  const resources = [];
  const track = geometry => (resources.push(geometry), geometry);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  t.after(() => { resources.forEach(g => g.dispose()); material.dispose(); });
  const layout = PRESETS.A.layouts[0];
  const { beam, purlin } = resolveMemberSections(layout.sections);
  const clamp = new ClampPart({ modGapEWSection: FIX.modGapEW, purlinSection: purlin, clampMaterial: material, track });
  const bolts = new BoltsPart({ beamSection: beam, purlinSection: purlin, boltSteelMaterial: material, slotMaterial: material,
    CLIP: getPurlinClipSpec(layout.sections.purlinClip), track });
  const u = new THREE.Vector3(1, 0, 0), n = new THREE.Vector3(0, 1, 0);

  for (const { modT, edgeHeight, boltLength } of thicknessRows) {
    for (const kind of ['clampMid', 'clampSide']) {
      const collector = bolts.collector(modT), group = new THREE.Group();
      collector.add(kind, new THREE.Vector3(), new THREE.Vector3(0, 0, 1), n);
      assert.equal(collector.flush(group, group).m8c, 1);
      const shank = group.children.find(mesh => mesh.geometry.parameters?.radiusTop === 0.004);
      assert.ok(shank, 'M8 螺杆半径为 4 mm');
      shank.geometry.computeBoundingBox();
      closeMm(shank.geometry.boundingBox.getSize(new THREE.Vector3()).z, boltLength);
      const fromHead = x => new THREE.Raycaster(new THREE.Vector3(x, 0.0001, -0.1), new THREE.Vector3(0, 0, 1));
      const socketBottom = fromHead(0).intersectObjects(group.children)[0];
      const headFace = fromHead(0.004).intersectObjects(group.children)[0];
      closeMm(socketBottom.distance - headFace.distance, 4);
    }

    for (const clampL of lengths) {
      const calls = [], hwSlope = new THREE.Group();
      const counts = clamp.build({
        P: { modT, clampL }, S: { purlins: [0], along: () => ({ x: 0, y: 0 }), hModBot: 0 },
        layout: { cols: 2, arrW: 2020, pitchEW: 1020 }, u, n, hwSlope,
        bolts: { add: (kind, point, axis) => calls.push({ kind, point, axis }) },
      });
      assert.deepEqual(counts, { mid: 1, side: 2 });
      const meshes = hwSlope.children.flatMap(instances => Array.from({ length: instances.count }, (_, i) => {
        const mesh = new THREE.Mesh(instances.geometry, material);
        instances.getMatrixAt(i, mesh.matrix);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrixWorld(true);
        return mesh;
      }));
      assert.equal(calls.length, 3);
      for (const { kind, point, axis } of calls) {
        const bounds = new THREE.Box3();
        for (const mesh of meshes) {
          const box = new THREE.Box3().setFromObject(mesh);
          if (Math.abs(box.getCenter(new THREE.Vector3()).z - point.z) < 0.06) bounds.union(box);
        }
        closeMm(bounds.max.x - bounds.min.x, clampL);
        if (kind === 'clampSide') {
          closeMm(bounds.max.y - bounds.min.y, edgeHeight);
        } else {
          // 在两道竖壁的直线段量槽外宽，避开上方压翼及下方圆角。
          const start = new THREE.Vector3(0, (modT - 7) / 1000, 0.025);
          const wallHits = new THREE.Raycaster(start, new THREE.Vector3(0, 0, -1), 0, 0.05).intersectObjects(meshes);
          assert.ok(wallHits.length >= 4);
          closeMm(wallHits[0].point.z - wallHits.at(-1).point.z, 20);
        }
        // 沿螺栓轴线从檩条向上投射。孔心和孔内不应有封面，略过半径应命中压块底板。
        for (const offset of [0, 4.4, 4.6]) {
          const origin = point.clone().addScaledVector(u, offset / 1000);
          const ray = new THREE.Raycaster(origin, axis.clone().negate());
          assert.equal(ray.intersectObjects(meshes).length > 0, offset > 4.5, `${kind}，距孔心 ${offset} mm`);
        }
      }
    }
  }
});
