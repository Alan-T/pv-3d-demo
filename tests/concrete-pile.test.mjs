import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Vector3 } from 'three';
import { createBracket } from '../src/model/bracket.ts';
import { braceConnectorPlates } from '../src/domain/specs/brace-connector-spec.ts';
import { FIX, PRESETS } from '../src/config.ts';
import { MM } from '../src/model/geometry/core.ts';
import { createMaterials } from '../src/viewer/materials.ts';
import { createRuntimeContext } from '../src/viewer/runtime-context.ts';
import { createSceneController } from '../src/viewer/scene.ts';
import { getPresetParameters } from '../src/domain/model-parameters.ts';
import { createPartOptions } from '../src/model/part-options.ts';
import { createSectionGeometry, createSectionCapGeometry } from '../src/model/geometry/section-geometry.ts';
import { resolveMemberSections } from '../src/domain/specs/section-spec.ts';
import { solve, layoutEW } from '../src/domain/solve.ts';

function bracketBuilder(t) {
  const { M, modMats, disposeMaterials } = createMaterials(createRuntimeContext(), createSceneController());
  t.after(disposeMaterials);
  const parameters = { ...getPresetParameters(PRESETS.A), cols: 8, embed: 1800 };
  // 两排截面不同，分别验证各自桩径的增量。
  const sections = resolveMemberSections({ ...PRESETS.A.layouts[0].sections, postR: 'C220*100*30*4.0' });
  const geometries = [];
  const partOptions = createPartOptions({
    sections, materials: M, connections: { plates: braceConnectorPlates },
    geometry: { createSectionGeometry, createSectionCapGeometry, modMats },
    track: geometry => { geometries.push(geometry); return geometry; },
  });
  t.after(() => geometries.forEach(geometry => geometry.dispose()));
  const build = overrides => createBracket({ ...parameters, ...overrides }, {
    sections, partOptions, solvers: { solve, layoutEW }, sectionRange: () => [0, 0],
  });
  return { build, M };
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

test('水泥灌注桩包住各榀埋地立柱，切换基础类型保留原有支架', t => {
  const { build, M } = bracketBuilder(t);
  const driven = build({ pileFoundationType: '锤入桩', slopeEW: 5 });
  driven.model.updateMatrixWorld(true);
  const bounds = mesh => new Box3().setFromObject(mesh);
  const steel = driven.groups.buried.children.map(bounds);
  assert.equal(steel.length, driven.layout.frames * 2);
  const { diameterAllowance, endAllowance } = FIX.concretePile;
  assert.equal(diameterAllowance, 100);

  for (const type of ['水泥灌注桩', '水泥台桩', '螺旋桩']) {
    const result = build({ pileFoundationType: type, slopeEW: 5 });
    assert.deepEqual(result.layout.counts, driven.layout.counts);
    for (const key of ['lenF', 'lenR', 'beamLen', 'braceF', 'braceR']) {
      assert.equal(result.solution[key], driven.solution[key]);
    }
    result.model.updateMatrixWorld(true);
    const buried = result.groups.buried.children;
    assert.deepEqual(buried.filter(mesh => mesh.material === M.buried).map(bounds), steel);
    const piles = buried.filter(mesh => mesh.material === M.concrete);
    assert.equal(piles.length, type === '水泥灌注桩' ? steel.length : 0);
    const remaining = new Set(steel);
    for (const mesh of piles) {
      const box = bounds(mesh), center = box.getCenter(new Vector3());
      const post = [...remaining].find(post => post.containsPoint(center));
      assert.ok(post, '每根桩应与一根埋地钢柱对应');
      remaining.delete(post);
      const postCenter = post.getCenter(new Vector3()), postSize = post.getSize(new Vector3());
      close(center.x, postCenter.x);
      close(center.z, postCenter.z);
      close(box.min.y, post.min.y - endAllowance * MM);
      close(box.max.y, post.max.y + endAllowance * MM);
      const size = box.getSize(new Vector3());
      close(size.x, size.z);
      close(size.x - Math.max(postSize.x, postSize.z), diameterAllowance * MM);
    }
  }
});

test('南北坡度下前后灌注桩的实体上下标高覆盖所选坡向', t => {
  const { build, M } = bracketBuilder(t);
  // 柱距 3000、埋深 1800，桩顶、桩底分别外伸 50 mm。
  for (const [slopeNS, alongSlope, rearMin, rearMax] of [
    [-10, 0, -2150, 350], [0, 0, -1850, 50], [10, 0, -2150, 350],
    [-10, 1, -2150, 50], [0, 1, -1850, 50], [10, 1, -1850, 350],
  ]) {
    const { groups, layout, model, solution } = build({ slopeNS, alongSlope, pileFoundationType: '水泥灌注桩' });
    model.updateMatrixWorld(true);
    const piles = groups.buried.children.filter(mesh => mesh.material === M.concrete);
    assert.equal(piles.length, layout.frames * 2);
    for (const mesh of piles) {
      const box = new Box3().setFromObject(mesh);
      const rear = Math.abs(box.getCenter(new Vector3()).x - solution.xr * MM) < 1e-6;
      close(box.min.y, (rear ? rearMin : -1850) * MM);
      close(box.max.y, (rear ? rearMax : 50) * MM);
    }
  }
});
