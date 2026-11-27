import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Vector3 } from 'three';
import { createBracket } from '../src/bracket.ts';
import { braceConnectorPlates } from '../src/brace-connector-spec.ts';
import { FIX, PRESETS } from '../src/config.ts';
import { MM } from '../src/core.ts';
import { M, modMats } from '../src/materials.ts';
import { getPresetParameters } from '../src/model-parameters.ts';
import { createPartOptions } from '../src/part-options.ts';
import { createSectionGeometry, createSectionCapGeometry } from '../src/section-geometry.ts';
import { resolveMemberSections } from '../src/section-spec.ts';
import { solve, layoutEW } from '../src/solve.ts';

test('水泥灌注桩包住各榀埋地立柱，切换基础类型保留原有支架', t => {
  const parameters = { ...getPresetParameters(PRESETS.A), cols: 8, slopeNS: -7, slopeEW: 5, embed: 1800 };
  // 两排截面不同，分别验证各自桩径的增量。
  const sections = resolveMemberSections({ ...PRESETS.A.layouts[0].sections, postR: 'C220*100*30*4.0' });
  const geometries = [];
  const partOptions = createPartOptions({
    sections, materials: M, connections: { plates: braceConnectorPlates },
    geometry: { createSectionGeometry, createSectionCapGeometry, modMats },
    track: geometry => { geometries.push(geometry); return geometry; },
  });
  t.after(() => geometries.forEach(geometry => geometry.dispose()));
  const build = pileFoundationType => createBracket({ ...parameters, pileFoundationType }, {
    sections, partOptions, solvers: { solve, layoutEW }, sectionRange: () => [0, 0],
  });
  const driven = build('锤入桩');
  driven.model.updateMatrixWorld(true);
  const bounds = mesh => new Box3().setFromObject(mesh);
  const steel = driven.groups.buried.children.map(bounds);
  assert.equal(steel.length, driven.layout.frames * 2);
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);
  const { diameterAllowance, endAllowance } = FIX.concretePile;
  assert.equal(diameterAllowance, 100);

  for (const type of ['水泥灌注桩', '水泥台桩', '螺旋桩']) {
    const result = build(type);
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
