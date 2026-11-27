import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESETS, SECTION_LABEL } from '../src/config.ts';
import { getPresetParameters, splitDrawingPreset } from '../src/domain/model-parameters.ts';
import { resolveMemberSections } from '../src/domain/specs/section-spec.ts';
import { BRACE_JOINT, braceConnectorPlates, parseBraceConnectorSpec } from '../src/domain/specs/brace-connector-spec.ts';
import { braceConnection } from '../src/domain/brace-layout.ts';
import { MM } from '../src/model/geometry/core.ts';
import { DrawingLayouts } from '../src/domain/layout-variants.ts';
import { BraceConnectorPart } from '../src/model/parts/brace-connector.ts';
import { layoutEW, solve } from '../src/domain/solve.ts';

test('图纸顶层的项目资料供表单独立编辑，初始化和重置模型只读取设计参数', () => {
  for (const preset of Object.values(PRESETS)) {
    assert.ok(!Object.hasOwn(preset, 'projectInfo'));
    const { projectInfo } = splitDrawingPreset(preset);
    const drawing = new DrawingLayouts(preset);
    drawing.reset();
    const initial = getPresetParameters(preset), restored = drawing.getModelParameters();
    for (const [key, value] of Object.entries(projectInfo)) {
      assert.ok(Object.hasOwn(preset, key), key);
      assert.equal(value, preset[key], key);
      assert.ok(!Object.hasOwn(initial, key), key);
      assert.ok(!Object.hasOwn(restored, key), key);
    }
    projectInfo.name = '已编辑项目名称';
    assert.notEqual(projectInfo.name, preset.name);
  }
});

test('图纸各自保留排布列表；组件尺寸和倾角共享，东西向布置与构件截面独立', () => {
  const a = new DrawingLayouts(PRESETS.A), b = new DrawingLayouts(PRESETS.B);
  assert.deepEqual(a.layouts.map(item => item.cols), [26, 13]);
  assert.deepEqual(b.layouts.map(item => item.cols), [27, 14]);

  const p = a.getModelParameters();
  Object.assign(p, { cols: 24, pitch: 3200, tilt: 18, modW: 1250, purlinTies: 'custom', purlinTieSpans: [1, 0] });
  a.captureParameters(p);
  a.active.sections.purlinTie = 'C60*40*10*1.6';
  p.purlinTieSpans[0] = 0;
  a.select('2');
  assert.equal(a.getModelParameters().cols, 13);
  assert.equal(a.getModelParameters().tilt, 18);
  assert.equal(a.getModelParameters().modW, 1250);
  assert.equal(a.active.sections.purlinTie, PRESETS.A.layouts[1].sections.purlinTie);
  assert.equal(b.getModelParameters().tilt, PRESETS.B.tilt);
  a.select('1');
  assert.equal(a.getModelParameters().pitch, 3200);
  assert.equal(a.active.sections.purlinTie, 'C60*40*10*1.6');
  assert.deepEqual(a.getModelParameters().purlinTieSpans, [1, 0]);
  assert.equal(PRESETS.A.layouts[0].cols, 26);
});

test('复制排布独立保留自定义段长，重置后恢复各模板排布的分段', () => {
  for (const preset of Object.values(PRESETS)) {
    const drawing = new DrawingLayouts(preset);
    const [first, second] = drawing.layouts;
    const lengths = [5650, 3950, 4000];
    drawing.captureParameters({ purlinCutMode: 'custom', purlinCutLengths: lengths });
    assert.deepEqual(first.purlinCutLengths, lengths);
    drawing.select(second.id);
    assert.equal(drawing.getModelParameters().purlinCutMode, 'auto');
    assert.deepEqual(drawing.getModelParameters().purlinCutLengths, []);
    drawing.select(first.id);
    drawing.add();
    assert.equal(drawing.active.purlinCutMode, 'custom');
    assert.deepEqual(drawing.active.purlinCutLengths, lengths);
    assert.notEqual(drawing.active.purlinCutLengths, first.purlinCutLengths);
    drawing.reset();
    for (const layout of drawing.layouts) assertAutomaticCuts(layout);
    assert.equal(drawing.layouts.length, preset.layouts.length);
  }
});

const singlePlate = '160*120*5.75', doublePlate = '280*120*5.75';
const accessoryKeys = ['purlinClip', 'purlinConnector', 'braceConnector'];

test('所有预设排布的规格、材质按相同构件顺序对应，斜撑连接件保存单块板尺寸', () => {
  for (const [preset, spec] of [[PRESETS.A, singlePlate], [PRESETS.B, doublePlate]]) {
    for (const layout of [...preset.layouts, ...new DrawingLayouts(preset).layouts]) {
      assert.deepEqual(Object.keys(layout.sections), Object.keys(layout.materials));
      assert.equal(Object.keys(layout.sections).length, 13);
      assert.ok(layout.sections.purlinClip);
      assert.ok(layout.sections.purlinConnector);
      assert.equal(layout.sections.braceConnector, spec);
      for (const key of accessoryKeys) assert.equal(layout.materials[key], 'Q235B');
      for (const key of Object.keys(SECTION_LABEL)) assert.equal(layout.materials[key], 'S420GD');
      assert.ok(!Object.hasOwn(layout, 'purlinClip'));
      assert.ok(!Object.hasOwn(layout, 'purlinConnector'));
    }
  }
});

test('修改柱截面与共用外斜撑时同步各排布连接板尺寸，材质独立保留', () => {
  const preset = structuredClone(PRESETS.B);
  preset.layouts[0].sections.braceConnector = 'auto';
  preset.layouts[1].sections.braceConnector = singlePlate;
  const drawing = new DrawingLayouts(preset);
  const specs = () => drawing.layouts.map(layout => layout.sections.braceConnector);
  assert.deepEqual(specs(), [doublePlate, doublePlate]);
  drawing.setMaterialGrade('braceConnector', 'Q355B');
  drawing.setSection('postR', 'C140*60*20*3.0');
  assert.deepEqual(specs(), [singlePlate, doublePlate]);

  drawing.add();
  assert.equal(drawing.active.materials.braceConnector, 'Q355B');
  assert.equal(drawing.active.sections.braceConnector, singlePlate);
  drawing.setMaterialGrade('braceConnector', 'S350GD');
  drawing.setSection('postR', preset.layouts[0].sections.postR);
  assert.deepEqual(specs(), [singlePlate, doublePlate, doublePlate]);
  drawing.captureParameters({ outer: 0 });
  assert.deepEqual(specs(), [singlePlate, singlePlate, singlePlate]);

  drawing.select('2');
  drawing.reset();
  assert.deepEqual(specs(), [doublePlate, doublePlate]);
  assert.deepEqual(drawing.layouts.map(layout => layout.materials.braceConnector), ['Q235B', 'Q235B']);
});

test('旧排布连接规格迁入 sections，修改、复制、切换和恢复后按当前排布生成扁平参数', () => {
  const preset = structuredClone(PRESETS.A);
  const [legacy, mixed] = preset.layouts;
  const oldSpecs = { purlinClip: 'L90*56*5.0*50', purlinConnector: 'U98*55*3.0*220' };
  const newSpecs = { purlinClip: 'L100*63*6.0*50', purlinConnector: 'U108*55*3.0*240' };
  for (const layout of [legacy, mixed]) Object.assign(layout, oldSpecs);
  for (const key of Object.keys(oldSpecs)) delete legacy.sections[key];
  Object.assign(mixed.sections, newSpecs);
  const drawing = new DrawingLayouts(preset);

  function check(expected) {
    const parameters = drawing.getModelParameters();
    for (const [key, spec] of Object.entries(expected)) {
      assert.equal(drawing.active.sections[key], spec);
      assert.equal(parameters[key], spec);
      assert.ok(!Object.hasOwn(drawing.active, key));
    }
    assert.ok(!Object.hasOwn(parameters, 'sections'));
  }
  for (const key of Object.keys(oldSpecs)) {
    assert.equal(getPresetParameters(preset, legacy)[key], oldSpecs[key]);
    assert.equal(getPresetParameters(preset, mixed)[key], newSpecs[key]);
  }
  check(oldSpecs);
  drawing.select('2');
  check(newSpecs);
  drawing.captureParameters(oldSpecs);
  check(oldSpecs);
  drawing.add();
  check(oldSpecs);
  drawing.captureParameters(newSpecs);
  check(newSpecs);
  drawing.select('2');
  check(oldSpecs);
  drawing.reset();
  check(oldSpecs);
  drawing.select('2');
  check(newSpecs);
});

test('前后柱共用实际斜撑板规格，安装位置按各自柱宽调整', t => {
  const parameters = getPresetParameters(PRESETS.B);
  const names = PRESETS.B.layouts[0].sections;
  const narrow = 'C80*40*15*3.0', wide = 'C200*80*30*3.0';
  for (const [postF, postR, outer, split, offsets, expectedLabel] of [
    [narrow, narrow, 1, false, [120, 120], '双面 280×120×5.75'],
    [wide, narrow, 0, false, [160, 120], '单面 160×120×5.75'],
    [wide, narrow, 1, true, [170, 140], '单面 160×120×5.75（每柱两块）'],
    [narrow, wide, 1, true, [140, 170], '单面 160×120×5.75（每柱两块）'],
  ]) {
    const sections = resolveMemberSections({ ...names, postF, postR });
    const s = solve({ ...parameters, outer }, sections);
    const connector = new BraceConnectorPart({
      plates: braceConnectorPlates, postFSection: sections.postF, postRSection: sections.postR,
      track(geometry) { t.after(() => geometry.dispose()); return geometry; },
    });
    assert.deepEqual(s.connections.map(c => c.offset), offsets);
    for (const [i, c] of s.connections.entries()) {
      const joint = connector.braceJoint(c, i ? s.tRp : s.tFp, i ? s.outer?.toRp : s.outer?.toFp);
      assert.equal(joint.specLabel, expectedLabel);
      assert.equal(joint.split, split);
      assert.equal(joint.plateCount, split ? 2 : 1);
      assert.equal(joint.boltRoles.filter(role => role === 'post').length, 2 * joint.plateCount);
      if (split) {
        assert.ok(c.plateShift >= BRACE_JOINT.singleBack);
        for (const x of [joint.bolts[0][0], joint.bolts[2][0]]) {
          assert.ok(Math.abs(x - c.xc) + BRACE_JOINT.slotW / 2 <= joint.postSection.d / 2);
        }
        assert.equal(joint.Q.x, joint.bolts[0][0] + c.side * BRACE_JOINT.boltU);
        assert.equal(joint.o.Q.x, joint.bolts[2][0] - c.side * BRACE_JOINT.boltU);
      }
    }
  }
  const sections = resolveMemberSections({ ...names, postF: 'C50*30*10*2.0', postR: wide });
  const s = solve({ ...parameters, outer: 1 }, sections);
  assert.ok(s.connections.every(c => c.split));
  assert.ok(s.warn.some(w => w.includes('前立柱截面宽 50 mm') && w.includes('安装孔超出柱边')));
});

test('双面板的模型与标注读取独立规格，宽柱分装仍使用两块单面板', t => {
  const connector = new BraceConnectorPart({
    plates: { ...braceConnectorPlates, double: parseBraceConnectorSpec('300*150*7.0') },
    postFSection: resolveMemberSections(PRESETS.A.layouts[0].sections).postF,
    track(geometry) { t.after(() => geometry.dispose()); return geometry; },
  });
  for (const [postWidth, dimensions, label] of [
    [90, [300, 150, 7], '双面 300×150×7.0'],
    // 柱宽 140 时两块单面板的背边相接，总宽为两块板宽之和。
    [140, [320, 120, 5.75], '单面 160×120×5.75（每柱两块）'],
  ]) {
    const connection = braceConnection({ x: 0, y: 0, side: 1, outer: true, postWidth,
      boltOffset: BRACE_JOINT.boltU, singleBack: BRACE_JOINT.singleBack, rise: BRACE_JOINT.rise });
    const joint = connector.braceJoint(connection, { x: 500, y: 500 }, { x: -500, y: 500 });
    joint.plateGeo.computeBoundingBox();
    const { min, max } = joint.plateGeo.boundingBox;
    const size = max.clone().sub(min).toArray().map(value => Number((value / MM).toFixed(3)));
    assert.deepEqual(size, dimensions);
    assert.equal(joint.specLabel, label);
  }
});

test('构件材质与截面独立，复制、切换和恢复排布均保留正确牌号', () => {
  const preset = structuredClone(PRESETS.A);
  preset.layouts[1].materials = { beam: 'S350GD', purlinClip: '', purlinConnector: 'Q355B' };
  const drawing = new DrawingLayouts(preset);
  const first = drawing.active;
  assert.deepEqual(first.materials, preset.layouts[0].materials);
  assert.equal(drawing.setMaterialGrade('postF', '  S390GD+ZM  '), 'S390GD+ZM');
  assert.equal(drawing.setMaterialGrade('postR', '  '), '');
  assert.equal(drawing.setMaterialGrade('unknown', 'grade'), undefined);
  assert.ok(!Object.hasOwn(first.materials, 'unknown'));
  assert.deepEqual(first.sections, preset.layouts[0].sections);
  assert.ok(!Object.hasOwn(drawing.getModelParameters(), 'materials'));
  assert.ok(!Object.hasOwn(getPresetParameters(preset, first), 'materials'));
  drawing.captureParameters({ materials: { postF: 'S450GD' } });
  assert.equal(first.materials.postF, 'S390GD+ZM');

  drawing.add();
  assert.deepEqual(drawing.active.materials, first.materials);
  drawing.setMaterialGrade('postF', 'S550GD');
  assert.equal(first.materials.postF, 'S390GD+ZM');
  drawing.select('2');
  assert.deepEqual(drawing.active.materials, preset.layouts[1].materials);
  drawing.setMaterialGrade('purlinConnector', 'S450GD');
  drawing.setMaterialGrade('purlinClip', 'Q235B');
  drawing.reset();
  assert.deepEqual(drawing.active.materials, preset.layouts[0].materials);
  drawing.select('2');
  assert.deepEqual(drawing.active.materials, { beam: 'S350GD', purlinClip: '', purlinConnector: 'Q355B' });
  drawing.select('1');
  for (const key of accessoryKeys) assert.equal(drawing.setMaterialGrade(key, ''), '');
  drawing.reset();
  for (const key of accessoryKeys) assert.equal(drawing.active.materials[key], 'Q235B');
  assert.deepEqual(preset.layouts[0].materials, PRESETS.A.layouts[0].materials);
});

test('旧前后斜撑连接件规格迁入共用规格，几何计算仍使用实际截面', () => {
  const preset = structuredClone(PRESETS.A);
  const sections = preset.layouts[0].sections;
  delete sections.braceConnector;
  Object.assign(sections, { braceConnectorF: 'auto', braceConnectorR: 'auto' });
  const drawing = new DrawingLayouts(preset);
  assert.equal(drawing.active.sections.braceConnector, singlePlate);
  for (const key of ['braceConnectorF', 'braceConnectorR']) {
    assert.ok(!Object.hasOwn(drawing.active.sections, key));
    assert.ok(!Object.hasOwn(drawing.getModelParameters(), key));
  }
  assert.deepEqual(resolveMemberSections(sections), resolveMemberSections(drawing.active.sections));
});

function applyCustomCuts(drawing, id) {
  drawing.select(id);
  const { cuts } = layoutEW(drawing.getModelParameters(), resolveMemberSections(drawing.active.sections));
  assert.equal(cuts.valid, true);
  const lengths = cuts.segments.map(segment => segment.length);
  drawing.captureParameters({ purlinCutMode: 'custom', purlinCutLengths: lengths });
  return lengths;
}

function assertAutomaticCuts(layout) {
  assert.equal(layout.purlinCutMode, 'auto');
  assert.deepEqual(layout.purlinCutLengths, []);
}

test('修改最大料长会让整张图纸按新上限重切，选择相同上限则保留自定义', () => {
  const drawing = new DrawingLayouts(PRESETS.A);
  drawing.captureParameters({ maxPurlin: 5700 });
  const first = applyCustomCuts(drawing, '1');
  applyCustomCuts(drawing, '2');
  drawing.captureParameters({ maxPurlin: '5700' });
  assert.equal(drawing.active.purlinCutMode, 'custom');
  assert.deepEqual(drawing.layouts[0].purlinCutLengths, first);

  // 旧段长均短于新上限，已经切回自动的排布也需要清除上次的自定义段长。
  drawing.captureParameters({ purlinCutMode: 'auto' });
  drawing.captureParameters({ maxPurlin: '7200' });
  for (const layout of drawing.layouts) assertAutomaticCuts(layout);
  const { cuts } = layoutEW(drawing.getModelParameters(), resolveMemberSections(drawing.active.sections));
  assert.deepEqual(cuts.segments.map(s => s.length), [6150, 6100, 5021]);

  applyCustomCuts(drawing, '2');
  drawing.select('1');
  drawing.reset();
  assert.equal(drawing.sharedParameters.maxPurlin, 9000);
  assertAutomaticCuts(drawing.layouts[1]);
});

test('切换排布或调整倾角和榀距保留自定义段长，调整列数仅清空当前排布', () => {
  const drawing = new DrawingLayouts(PRESETS.A);
  const first = applyCustomCuts(drawing, '1');
  const second = applyCustomCuts(drawing, '2');
  drawing.select('1');
  drawing.captureParameters({ ...drawing.getModelParameters(), tilt: 25, pitch: 2850 });
  assert.equal(drawing.active.purlinCutMode, 'custom');
  assert.deepEqual(drawing.active.purlinCutLengths, first);
  drawing.captureParameters({ ...drawing.getModelParameters(), cols: 25 });
  assertAutomaticCuts(drawing.active);
  drawing.select('2');
  assert.equal(drawing.active.purlinCutMode, 'custom');
  assert.deepEqual(drawing.active.purlinCutLengths, second);
});

test('组件宽度或固定方式改变总长时，清空同图纸所有受影响排布的段长', () => {
  for (const changed of [{ modW: 1304 }, { fix: 'clamp' }]) {
    const drawing = new DrawingLayouts(PRESETS.A);
    applyCustomCuts(drawing, '1');
    applyCustomCuts(drawing, '2');
    // 切回自动时旧净长可供再次自定义使用，总长变化后这份缓存也应清掉。
    drawing.captureParameters({ purlinCutMode: 'auto' });
    drawing.captureParameters({ ...drawing.getModelParameters(), ...changed });
    for (const layout of drawing.layouts) assertAutomaticCuts(layout);
  }
});

test('同时更新共享宽度和当前列数，按各排布实际总长分别判断', () => {
  const drawing = new DrawingLayouts(PRESETS.A);
  const first = applyCustomCuts(drawing, '1');
  applyCustomCuts(drawing, '2');
  drawing.select('1');
  // 26 × (1303 + 20) = 27 × (1254 + 20)，排布1总长相同，排布2仍为13列。
  drawing.captureParameters({ ...drawing.getModelParameters(), modW: 1254, cols: 27 });
  assert.equal(drawing.active.purlinCutMode, 'custom');
  assert.deepEqual(drawing.active.purlinCutLengths, first);
  drawing.select('2');
  assertAutomaticCuts(drawing.active);
});

test('重置后重新加载非当前排布的模板套数和自定义段长', () => {
  const preset = structuredClone(PRESETS.A);
  const layout = preset.layouts[1];
  const { cuts } = layoutEW(getPresetParameters(preset, layout), resolveMemberSections(layout.sections));
  layout.purlinCutMode = 'custom';
  layout.purlinCutLengths = cuts.segments.map(segment => segment.length);
  const drawing = new DrawingLayouts(preset);
  drawing.captureParameters({ modW: 1304 });
  applyCustomCuts(drawing, '2');
  drawing.setQuantity(8);
  drawing.select('1');
  drawing.reset();
  drawing.select('2');
  assert.equal(drawing.getModelParameters().modW, PRESETS.A.modW);
  assert.equal(drawing.active.quantity, layout.quantity);
  assert.equal(drawing.active.purlinCutMode, 'custom');
  assert.deepEqual(drawing.active.purlinCutLengths, layout.purlinCutLengths);
});

test('重置恢复被删除的模板排布、原始顺序和套数，并选中排布1', () => {
  const layouts = [
    { quantity: 4, cols: 29, pitch: 2500, offset: 11, sections: { beam: 'C80' } },
    { quantity: 7, cols: 21, pitch: 2800, offset: 12, sections: { beam: 'C90' } },
    { quantity: 2, cols: 9, pitch: 3100, offset: 13, sections: { beam: 'C100' } },
  ];
  const preset = { name: '测试图纸', designLife: 25, tilt: 25, layouts };
  const drawing = new DrawingLayouts(preset);
  const expectedLayouts = layouts.map(layout => ({
    ...layout, sections: { ...layout.sections, braceConnector: singlePlate },
  }));
  assert.deepEqual(drawing.layouts.map(({ id, label, materials, ...layout }) => layout), expectedLayouts);
  const expectedFirst = { tilt: 25, cols: 29, pitch: 2500, offset: 11 };
  assert.deepEqual(getPresetParameters(preset), expectedFirst);
  assert.deepEqual(getPresetParameters(preset, drawing.active), expectedFirst);
  assert.deepEqual(drawing.getModelParameters(), expectedFirst);
  drawing.select('3');
  drawing.captureParameters({ ...drawing.getModelParameters(), tilt: 20, offset: 20 });
  drawing.setQuantity(8);
  drawing.active.sections.beam = 'C120';
  assert.equal(drawing.getModelParameters().offset, 20);
  assert.equal(layouts[2].offset, 13);
  assert.equal(layouts[2].sections.beam, 'C100');
  drawing.select('2');
  assert.deepEqual(drawing.getModelParameters(), { tilt: 20, cols: 21, pitch: 2800, offset: 12 });
  drawing.select('3');
  drawing.remove('1');
  drawing.reset();
  assert.equal(drawing.activeId, '1');
  assert.deepEqual(drawing.getModelParameters(), expectedFirst);
  assert.deepEqual(drawing.layouts, new DrawingLayouts(preset).layouts);

  drawing.add();
  assert.equal(drawing.activeId, '4');
  drawing.reset();
  assert.equal(drawing.active.quantity, layouts[0].quantity);
  assert.equal(drawing.select('4'), false);
  drawing.add();
  assert.equal(drawing.activeId, '4');
  assert.equal(drawing.active.label, '排布4');
});

test('只有一条排布预设时可直接使用和新增', () => {
  const preset = { ...PRESETS.B, layouts: [PRESETS.B.layouts[1]] };
  const drawing = new DrawingLayouts(preset);
  assert.deepEqual(drawing.layouts.map(item => item.id), ['1']);
  assert.equal(drawing.remove('1'), false);
  drawing.add();
  assert.equal(drawing.activeId, '2');
  assert.deepEqual(drawing.getModelParameters(), getPresetParameters(preset));
  drawing.reset();
  assert.deepEqual(drawing.getModelParameters(), getPresetParameters(preset));
});

test('新增排布独立复制当前参数，重置后每个排布重新读取模板数据', () => {
  const drawing = new DrawingLayouts(PRESETS.A);
  drawing.select('2');
  drawing.captureParameters({ ...drawing.getModelParameters(),
    cols: 11, pitchEnd: 2400, postTieR: 'custom', postTieSpansR: [1, 0], tilt: 18,
  });
  drawing.active.sections.postR = 'C80*40*15*3.0';
  const original = solve(drawing.getModelParameters(), resolveMemberSections(drawing.active.sections));
  drawing.setQuantity('8');
  drawing.add();
  assert.equal(drawing.activeId, '3');
  assert.equal(drawing.active.quantity, 1);
  assert.equal(drawing.getModelParameters().cols, 11);
  assert.deepEqual(drawing.active.postTieSpansR, [1, 0]);
  drawing.active.postTieSpansR[1] = 1;
  drawing.active.sections.postR = 'C80*40*15*2.0';
  const copy = solve(drawing.getModelParameters(), resolveMemberSections(drawing.active.sections));
  assert.equal(copy.sections.postR.t, 2);
  assert.equal(original.sections.postR.t, 3);

  drawing.select('2');
  assert.deepEqual(drawing.active.postTieSpansR, [1, 0]);
  assert.equal(drawing.active.sections.postR, 'C80*40*15*3.0');
  assert.equal(drawing.active.quantity, 8);
  drawing.reset();
  assert.equal(drawing.activeId, '1');
  assert.deepEqual(drawing.layouts, new DrawingLayouts(PRESETS.A).layouts);
  assert.equal(drawing.getModelParameters().tilt, PRESETS.A.tilt);
  drawing.select('2');
  assert.equal(drawing.getModelParameters().cols, 13);
  assert.equal(drawing.active.quantity, PRESETS.A.layouts[1].quantity);
  assert.notEqual(drawing.active.postTieSpansR, PRESETS.A.layouts[1].postTieSpansR);
  assert.notEqual(drawing.active.sections, PRESETS.A.layouts[1].sections);
  assert.equal(drawing.select('3'), false);
});

test('套数必须为正整数；删除后名称连续，保留至少一个排布', () => {
  const drawing = new DrawingLayouts(PRESETS.A);
  drawing.setQuantity(9679);
  for (const value of ['', '2.5', 0, -1, Infinity, '无效']) assert.equal(drawing.setQuantity(value), 9679);
  drawing.add();
  assert.equal(drawing.remove('2'), true);
  assert.equal(drawing.activeId, '3');
  assert.deepEqual(drawing.layouts.map(item => item.label), ['排布1', '排布2']);
  assert.equal(drawing.remove('3'), true);
  assert.equal(drawing.activeId, '1');
  assert.equal(drawing.remove('1'), false);
  assert.equal(drawing.select('3'), false);
  assert.equal(drawing.remove('3'), false);
  drawing.add();
  assert.equal(drawing.activeId, '4');
  assert.equal(drawing.active.label, '排布2');
  assert.equal(drawing.remove('1'), true);
  assert.equal(drawing.activeId, '4');
  assert.equal(drawing.active.label, '排布1');
  assert.equal(drawing.remove('4'), false);
});

test('删除选中的首项后，下一排布保留参数和标识，后续新增按顺序编号', () => {
  const drawing = new DrawingLayouts(PRESETS.A);
  drawing.add();
  drawing.select('2');
  drawing.setQuantity(7);
  drawing.select('1');
  assert.equal(drawing.remove('1'), true);
  assert.equal(drawing.activeId, '2');
  assert.equal(drawing.active.cols, 13);
  assert.equal(drawing.active.quantity, 7);
  drawing.add();
  assert.deepEqual(drawing.layouts.map(({ id, label }) => [id, label]), [
    ['2', '排布1'], ['3', '排布2'], ['4', '排布3'],
  ]);
});
