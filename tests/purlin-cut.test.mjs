import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, MeshBasicMaterial, Vector3 } from 'three';
import { PRESETS } from '../src/config.ts';
import { getPresetParameters } from '../src/domain/model-parameters.ts';
import { resolveMemberSections } from '../src/domain/specs/section-spec.ts';
import { PurlinConnectorPart } from '../src/model/parts/purlin-connector.ts';
import { getPurlinConnectorSpec } from '../src/domain/specs/purlin-connector-spec.ts';
import { cutPurlin, PURLIN_CUT_GAP } from '../src/domain/purlin-cut.ts';
import { layoutEW } from '../src/domain/solve.ts';

const drawing = getPresetParameters(PRESETS.A);
const sections = resolveMemberSections(PRESETS.A.layouts[0].sections);
const netLengths = [5650, 3950, 4000, 3950, 4300, 4100, 4800, 3700];
function custom(lengths, overrides = {}) {
  return layoutEW({ ...drawing, purlinCutMode: 'custom', purlinCutLengths: lengths, ...overrides }, sections);
}

test('自定义八段净长从西到东布置，每个接缝中心放置连接件和八套螺栓', (t) => {
  const layout = custom(netLengths);
  assert.equal(layout.cuts.valid, true);
  assert.deepEqual(layout.cuts.segments.map(segment => segment.length), netLengths);
  const joints = [-11587, -7633, -3629, 325, 4629, 8733, 13537];
  assert.deepEqual(layout.cuts.positions, joints);
  for (const [index, z] of joints.entries()) {
    const { start, length } = layout.cuts.segments[index];
    assert.equal(start + length, z - PURLIN_CUT_GAP / 2);
    assert.equal(layout.cuts.segments[index + 1].start, z + PURLIN_CUT_GAP / 2);
  }
  const last = layout.cuts.segments.at(-1);
  assert.equal(last.start + last.length, layout.purlinLen / 2);

  const material = new MeshBasicMaterial();
  t.after(() => material.dispose());
  const connector = new PurlinConnectorPart({
    purlinSection: sections.purlin, connectorSpec: getPurlinConnectorSpec(drawing.purlinConnector),
    purlinConnectorMaterial: material, track(geometry) { t.after(() => geometry.dispose()); return geometry; },
  });
  const hardware = new Group();
  let boltCount = 0;
  connector.build({ layout, hwSlope: hardware, n: new Vector3(0, 1, 0), u: new Vector3(1, 0, 0),
    bolts: { add() { boltCount++; } } }, z => new Vector3(0, 0, z / 1000));
  assert.equal(hardware.children.length, joints.length);
  assert.equal(boltCount, joints.length * 8);
});

test('自定义段长保留输入精度，切换自动后沿用原切割算法', () => {
  const fractions = [5650.1, 3949.9, ...netLengths.slice(2)];
  assert.deepEqual(custom(fractions).cuts.segments.map(segment => segment.length), fractions);
  const auto = layoutEW({ ...drawing, purlinCutMode: 'auto', purlinCutLengths: fractions }, sections);
  assert.deepEqual(auto.cuts, layoutEW({ ...drawing, purlinCutMode: undefined }, sections).cuts);
  assert.deepEqual(auto.cuts.segments.map(segment => segment.length), [7000, 6800, 6900, 8050, 5712]);
});

test('自定义校验失败保留具体原因，模型回退整根且清除接头', () => {
  for (const [lengths, reason] of [
    [[], /请输入/], [[0], /第 1 段/], [[-1], /第 1 段/], [[3, NaN], /第 2 段/],
    [[Infinity], /第 1 段/], [[9001], /超过.*9000/], [[5000, 4000], /9004 mm，应为 34478/],
  ]) {
    const layout = custom(lengths);
    assert.equal(layout.cuts.valid, false);
    assert.match(layout.cuts.error, reason);
    assert.ok(layout.warn.some(message => message.includes(layout.cuts.error)));
    assert.deepEqual(layout.cuts.positions, []);
    assert.deepEqual(layout.cuts.segments, [{ start: -17239, length: 34478 }]);
  }
  assert.equal(custom(netLengths, { cols: 13 }).cuts.valid, false);
});

test('自定义可在最大料长以内主动分段，同时校验榀位和组件缝避让', () => {
  const cut = (lengths, posts) => cutPurlin({ cols: 1, modW: 1000, maxPurlin: 3000,
    purlinCutMode: 'custom', purlinCutLengths: lengths }, 2500, posts, 1000);
  assert.deepEqual(cut([2500], []).positions, []);
  assert.equal(cut([2500], []).valid, true);
  assert.deepEqual(cut([1498, 998], [750]).positions, [250]);
  assert.match(cut([1498, 998], [250]).error, /第 1 个接头距西端 1500 mm/);
  assert.match(cut([738, 1758], [-10]).error, /第 1 个接头距西端 740 mm/);
});
