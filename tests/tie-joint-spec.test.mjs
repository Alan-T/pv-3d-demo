import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { FIX, PRESETS, TIE_SECTION_LIB, applyPresetSections } from '../src/config.js';
import { solve, layoutEW } from '../src/solve.js';
import { calculatePostTies } from '../src/post-tie-layout.js';
import { calculatePurlinTies } from '../src/purlin-tie-layout.js';
import { createTieJointSpecs } from '../src/tie-joint-spec.js';
import { PostTiePart } from '../src/parts/post-tie.js';
import { PurlinTiePart } from '../src/parts/purlin-tie.js';
import { createSectionGeometry } from '../src/section-geometry.js';
import { ewMatrix } from '../src/core.js';

const mm = (x, y, z = 0) => new THREE.Vector3(x, y, z).multiplyScalar(.001);
const near = (a, b, message) => assert.ok(a.distanceTo(b) < 1e-8, message);

function fixture(overrides = {}) {
  const parameters = { ...PRESETS.A, ...overrides };
  const solution = solve(parameters), layout = layoutEW(parameters);
  layout.postTies = calculatePostTies(parameters, solution, layout);
  layout.purlinTies = calculatePurlinTies({ mode: parameters.purlinTies, selected: parameters.purlinTieSpans,
    purlins: solution.purlins, framePositions: layout.zs });
  return { solution, layout };
}

test('拉杆节点只取真实启用跨；前后排独立，无构件时为空', () => {
  applyPresetSections('A');
  let { solution, layout } = fixture({ postTieF: 'none', postTieR: 'none', purlinTies: 'none' });
  assert.deepEqual(createTieJointSpecs(solution, layout, FIX), { postTie: [null, null], purlinTie: [null, null] });
  ({ solution, layout } = fixture({ postTieF: 'custom', postTieSpansF: [1, 0, 1], postTieR: 'none',
    purlinTies: 'custom', purlinTieSpans: [0, 1] }));
  let specs = createTieJointSpecs(solution, layout, FIX);
  assert.equal(specs.postTie[0].bay, 2);
  assert.equal(specs.postTie[1], null);
  assert.deepEqual(specs.purlinTie.map(spec => spec.bay), [1, 1]);
  // 柱高不足时实际 rods 为空，即使参数选择了该跨，也不能生成虚构节点。
  layout.postTies[0] = { ...layout.postTies[0], valid: false, rods: [] };
  specs = createTieJointSpecs(solution, layout, FIX);
  assert.equal(specs.postTie[0], null);
});

test('立柱拉杆节点的孔心和端距对齐实际实体，C/L 与前后排、正负坡度均一致', () => {
  applyPresetSections('A');
  for (const slopeEW of [-10, 0, 10]) for (const tie of TIE_SECTION_LIB) {
    const { solution, layout } = fixture({ slopeEW });
    const sections = { ...FIX, postTie: tie };
    const specs = createTieJointSpecs(solution, layout, sections);
    for (const [index, row] of layout.postTies.entries()) {
      const sp = specs.postTie[index], side = row.rear ? 1 : -1;
      const rodIndex = row.rods.findIndex(rod => rod.bay === sp.bay && rod.direction === side);
      const post = row.rear ? FIX.postR : FIX.postF;
      const parent = new THREE.Group(), bolts = [];
      const material = new THREE.MeshBasicMaterial();
      const part = new PostTiePart({ section: tie, postSection: post, material,
        createSectionGeometry, track: geometry => geometry });
      try {
        part.build({ row, parent, bolts: { add: (kind, point) => bolts.push(point.clone()) } });
        const mesh = parent.children[rodIndex];
        const actualHole = bolts[rodIndex * 2 + 1].clone().add(mm(side * post.t, 0, 0));
        near(mm(0, 0).applyMatrix4(sp.matrix), actualHole, '详图中心必须对应真实螺栓安装点');
        const dim = sp.dims[0], dimEnd = mm(dim[2], dim[3]).applyMatrix4(sp.matrix);
        near(dimEnd, new THREE.Vector3(0, 0, 1).applyMatrix4(mesh.matrix), '端距尺寸必须指向实际杆端');
        assert.ok(Math.abs(dimEnd.distanceTo(actualHole) * 1000 - sp.endAllowance) < 1e-7);
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(sp.matrix);
        near(normal, new THREE.Vector3(side, 0, 0), '前后排均从所选拉杆一侧看柱翼缘');
        assert.ok(sp.leaders.some(leader => leader[3].includes(tie.name)));
        assert.ok(sp.matrix.determinant() > 0);
      } finally {
        part.geometry.dispose();
        material.dispose();
      }
    }
  }
});

test('水平立柱拉杆只有一个方向时，节点使用实际已有拉杆', () => {
  applyPresetSections('A');
  const { solution, layout } = fixture();
  const row = layout.postTies[0], rod = row.rods.at(-2);
  layout.postTies[0] = { ...row, rods: [{ ...rod, direction: 1, start: { ...rod.start, y: rod.end.y } }] };
  const sp = createTieJointSpecs(solution, layout, FIX).postTie[0];
  assert.ok(sp);
  near(mm(0, 0).applyMatrix4(sp.matrix), mm(row.x + FIX.postF.d / 2, rod.end.y, rod.end.z));
  assert.equal(sp.dims[0][3], 0);
});

test('檩条拉杆节点与实体安装孔及两端对齐，坡度只施加一次，三种截面均可用', () => {
  applyPresetSections('A');
  for (const slopeEW of [-10, 0, 10]) for (const tie of TIE_SECTION_LIB) {
    const { solution, layout } = fixture({ slopeEW, purlinTies: 'custom', purlinTieSpans: [1, 0, 1] });
    const specs = createTieJointSpecs(solution, layout, { ...FIX, purlinTie: tie });
    const parent = new THREE.Group(), material = new THREE.MeshBasicMaterial(), bolts = [];
    const part = new PurlinTiePart({ section: tie, purlinSection: FIX.purlin, material,
      createSectionGeometry, track: geometry => geometry });
    const u = new THREE.Vector3(solution.c, solution.s, 0), n = new THREE.Vector3(-solution.s, solution.c, 0);
    const transform = ewMatrix(layout.ew);
    try {
      part.build({ solution, ties: layout.purlinTies, parent, u, n,
        bolts: { add: (kind, point) => bolts.push(point.clone()) } });
      const rodIndex = layout.purlinTies.rods.length - 1, mesh = parent.children[rodIndex];
      const world = transform.clone().multiply(mesh.matrix);
      for (const [index, sp] of specs.purlinTie.entries()) {
        const boltIndex = rodIndex * solution.purlins.length + (index ? solution.purlins.length - 1 : 0);
        const actualHole = bolts[boltIndex].clone().addScaledVector(n, tie.t * .001).applyMatrix4(transform);
        near(mm(0, 0).applyMatrix4(sp.matrix), actualHole, '详图中心必须对应所选实际跨的檩条底面安装孔');
        const dim = sp.dims[0], dimEnd = mm(dim[2], dim[3]).applyMatrix4(sp.matrix);
        const centerY = tie.type === 'L' ? tie.f * .001 / 2 : 0;
        near(dimEnd, new THREE.Vector3(0, centerY, index).applyMatrix4(world), '首末端距必须对齐实体端面');
        assert.ok(Math.abs(dimEnd.distanceTo(actualHole) * 1000 - sp.endAllowance) < 1e-7);
        assert.ok(sp.leaders.some(leader => leader[3].includes(tie.name)));
        assert.ok(sp.leaders.some(leader => leader[3].includes('Ø14')));
        assert.equal(sp.bay, 2);
      }
    } finally {
      part.geometry.dispose();
      material.dispose();
    }
  }
});
