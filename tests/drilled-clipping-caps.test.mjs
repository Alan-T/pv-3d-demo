import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { FIX, PRESETS, TIE_SECTION_LIB, applyPresetSections, getPresetParameters } from '../src/config.ts';
import { ewMatrix } from '../src/core.ts';
import { solve, layoutEW } from '../src/solve.ts';
import { calculatePurlinTies } from '../src/purlin-tie-layout.ts';
import { PurlinTiePart } from '../src/parts/purlin-tie.ts';
import { createSectionGeometry } from '../src/section-geometry.ts';
import { createDrilledAngleGeometry, createDrilledChannelWebGeometry, createDrilledPurlinGeometry } from '../src/drilled-section-geometry.ts';
import { createTieJointSpecs } from '../src/tie-joint-spec.ts';
import { createClippingCaps } from '../src/clipping-caps.ts';

const MM = .001;
const channelArea = ({ d, f, l, t }) => t * (d + 2 * f + 2 * l) - 4 * t * t;

function capArea(caps, inverse = new THREE.Matrix4()) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let area = 0;
  for (const mesh of caps.children) {
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 3) {
      a.fromBufferAttribute(positions, i).applyMatrix4(inverse);
      b.fromBufferAttribute(positions, i + 1).applyMatrix4(inverse);
      c.fromBufferAttribute(positions, i + 2).applyMatrix4(inverse);
      area += b.sub(a).cross(c.sub(a)).length() / 2 / MM ** 2;
    }
  }
  return area;
}

function cutPlanes(spec) {
  const [x0, x1, y0, y1, z0, z1] = spec.clipBox;
  return [
    [[1, 0, 0], -x0], [[-1, 0, 0], x1],
    [[0, 1, 0], -y0], [[0, -1, 0], y1],
    [[0, 0, 1], -z0], [[0, 0, -1], z1],
  ].map(([normal, constant]) => new THREE.Plane(new THREE.Vector3(...normal), constant * MM).applyMatrix4(spec.matrix));
}

test('实际 C 型檩条拉杆前后节点：封口覆盖腹板、两翼及卷边，保留槽口', () => {
  try {
    for (const preset of ['A', 'B']) for (const slopeEW of [-10, 0, 10]) for (const section of TIE_SECTION_LIB.filter(item => item.type === 'C')) {
      applyPresetSections(preset);
      const parameters = { ...getPresetParameters(PRESETS[preset]), slopeEW, purlinTies: 'all' };
      const solution = solve(parameters), layout = layoutEW(parameters);
      layout.purlinTies = calculatePurlinTies({ mode: parameters.purlinTies, purlins: solution.purlins, framePositions: layout.zs });
      const specs = createTieJointSpecs(solution, layout, { ...FIX, purlinTie: section }).purlinTie;
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), resources = [];
      const track = resource => (resources.push(resource), resource);
      const parent = new THREE.Group();
      parent.matrixAutoUpdate = false;
      parent.matrix.copy(ewMatrix(layout.ew));
      const part = new PurlinTiePart({ section, purlinSection: FIX.purlin, material,
        createSectionGeometry, createDrilledAngleGeometry, createDrilledChannelWebGeometry, track });
      try {
        part.build({ solution, ties: layout.purlinTies, parent,
          u: new THREE.Vector3(solution.c, solution.s, 0), n: new THREE.Vector3(-solution.s, solution.c, 0) });
        const mesh = parent.children.at(-1);
        for (const [rear, spec] of specs.entries()) {
          const label = `${preset} ${section.name} slope=${slopeEW} side=${rear}`;
          const caps = createClippingCaps(mesh, cutPlanes(spec), { track });
          const inverse = spec.matrix.clone().invert();
          // 世界 Float32 顶点位于阵列最东跨，面积允许 0.15 mm² 的量化误差。
          assert.ok(Math.abs(capArea(caps, inverse) - channelArea(section)) < .15,
            `${label}: area=${capArea(caps, inverse)}, expected=${channelArea(section)}`);
          caps.matrixAutoUpdate = false;
          caps.matrix.copy(inverse);
          caps.updateMatrixWorld(true);
          const x = spec.clipBox[rear ? 0 : 1], direction = rear ? 1 : -1;
          const hit = (y, z) => new THREE.Raycaster(
            new THREE.Vector3(x - direction * 10, y, z).multiplyScalar(MM),
            new THREE.Vector3(direction, 0, 0), 0, .02,
          ).intersectObjects(caps.children).length > 0;
          const { d, f, l, t } = section;
          assert.equal(hit(-t / 2, 0), true, `${label}: web`);
          for (const side of [-1, 1]) {
            assert.equal(hit(-f / 2, side * (d / 2 - t / 2)), true, `${label}: flange ${side}`);
            assert.equal(hit(-f + t / 2, side * (d / 2 - l / 2)), true, `${label}: lip ${side}`);
          }
          assert.equal(hit(-f / 2, 0), false, `${label}: open channel`);
          assert.equal(hit(-f - 2, 0), false, `${label}: outside section`);
        }
      } finally { resources.forEach(resource => resource.dispose()); material.dispose(); }
    }
  } finally { applyPresetSections('A'); }
});

test('分片开孔型材在通孔中心剖切，仍保留真实孔洞且不丢钢板', () => {
  const length = 4000, hole = 1200, radius = 7;
  const cases = [
    { section: { type: 'C', d: 59, f: 39, l: 8, t: 1.6 }, create: createDrilledChannelWebGeometry,
      area: channelArea, empty: [0, .8], solid: [20, .8] },
    { section: { type: 'L', d: 35, f: 35, t: 1.6 }, create: createDrilledAngleGeometry,
      area: ({ d, f, t }) => t * (d + f - t), empty: [.8, 17.5], solid: [.8, 3] },
    { section: { type: 'C', d: 100, f: 55, l: 20, t: 1.8 }, create: createDrilledPurlinGeometry,
      area: channelArea, empty: [-49.1, 27.5], solid: [-49.1, 5] },
  ];
  for (const { section, create, area, empty, solid } of cases) {
    const geometry = create(section, length, [hole], radius);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.z = length * MM;
    const caps = createClippingCaps(mesh, [new THREE.Plane(new THREE.Vector3(0, 0, 1), -hole * MM)]);
    try {
      const expected = area(section) - 2 * radius * section.t;
      assert.ok(Math.abs(capArea(caps) - expected) < .02, `${create.name}: ${capArea(caps)} != ${expected}`);
      caps.updateMatrixWorld(true);
      const hit = ([x, y]) => new THREE.Raycaster(new THREE.Vector3(x * MM, y * MM, hole * MM - .01),
        new THREE.Vector3(0, 0, 1), 0, .02).intersectObjects(caps.children).length > 0;
      assert.equal(hit(empty), false, `${create.name}: drilled opening`);
      assert.equal(hit(solid), true, `${create.name}: material beside hole`);
    } finally {
      caps.children.forEach(cap => cap.geometry.dispose());
      geometry.dispose(); material.dispose();
    }
  }
});
