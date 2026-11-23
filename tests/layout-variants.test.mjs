import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESETS, getPresetParameters } from '../src/config.js';
import { DrawingLayouts } from '../src/layout-variants.js';
import { layoutEW } from '../src/solve.js';

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

test('自定义檩条分段只属于当前排布，复制和恢复后各自保留独立段长', () => {
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
    assert.equal(drawing.active.purlinCutMode, 'auto');
    assert.deepEqual(drawing.active.purlinCutLengths, []);
    assert.deepEqual(first.purlinCutLengths, lengths);
  }
});

function applyCustomCuts(drawing, id) {
  drawing.select(id);
  const { cuts } = layoutEW(drawing.getModelParameters());
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
  assert.deepEqual(layoutEW(drawing.getModelParameters()).cuts.segments.map(s => s.length), [6150, 6100, 5021]);

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

test('恢复图纸共用参数使其他排布总长改变时也清除其自定义段长', () => {
  const drawing = new DrawingLayouts(PRESETS.A);
  drawing.captureParameters({ modW: 1304 });
  applyCustomCuts(drawing, '2');
  drawing.setQuantity(8);
  drawing.select('1');
  drawing.reset();
  drawing.select('2');
  assert.equal(drawing.getModelParameters().modW, PRESETS.A.modW);
  assert.equal(drawing.active.quantity, 8);
  assertAutomaticCuts(drawing.active);
});

test('从预设逐项读取排布套数、参数和截面，恢复时取稳定标识对应的预设', () => {
  const layouts = [
    { quantity: 4, cols: 29, pitch: 2500, offset: 11, sections: { beam: 'C80' } },
    { quantity: 7, cols: 21, pitch: 2800, offset: 12, sections: { beam: 'C90' } },
    { quantity: 2, cols: 9, pitch: 3100, offset: 13, sections: { beam: 'C100' } },
  ];
  const preset = { projectInfo: {}, tilt: 25, layouts };
  const drawing = new DrawingLayouts(preset);
  assert.deepEqual(drawing.layouts.map(({ id, label, ...layout }) => layout), layouts);
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
  assert.equal(drawing.active.label, '排布2');
  assert.equal(drawing.active.quantity, 8);
  assert.deepEqual(drawing.getModelParameters(), { tilt: 25, cols: 9, pitch: 3100, offset: 13 });
  assert.deepEqual(drawing.active.sections, layouts[2].sections);

  drawing.add();
  assert.equal(drawing.activeId, '4');
  drawing.reset();
  assert.equal(drawing.active.quantity, 1);
  assert.deepEqual(drawing.getModelParameters(), expectedFirst);
  assert.deepEqual(drawing.active.sections, layouts[0].sections);
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

test('新增独立复制当前排布；恢复只重置当前排布和共享参数，保留套数', () => {
  const drawing = new DrawingLayouts(PRESETS.A);
  drawing.select('2');
  drawing.captureParameters({ ...drawing.getModelParameters(),
    cols: 11, pitchEnd: 2400, postTieR: 'custom', postTieSpansR: [1, 0], tilt: 18,
  });
  drawing.active.sections.postR = 'C80*40*15*3.0';
  drawing.setQuantity('8');
  drawing.add();
  assert.equal(drawing.activeId, '3');
  assert.equal(drawing.active.quantity, 1);
  assert.equal(drawing.getModelParameters().cols, 11);
  assert.deepEqual(drawing.active.postTieSpansR, [1, 0]);
  drawing.active.postTieSpansR[1] = 1;
  drawing.active.sections.postR = 'C80*40*15*2.0';

  drawing.select('2');
  assert.deepEqual(drawing.active.postTieSpansR, [1, 0]);
  assert.equal(drawing.active.sections.postR, 'C80*40*15*3.0');
  assert.equal(drawing.active.quantity, 8);
  drawing.reset();
  assert.equal(drawing.getModelParameters().tilt, PRESETS.A.tilt);
  assert.equal(drawing.getModelParameters().cols, 13);
  assert.equal(drawing.active.quantity, 8);
  assert.notEqual(drawing.active.postTieSpansR, PRESETS.A.layouts[1].postTieSpansR);
  assert.notEqual(drawing.active.sections, PRESETS.A.layouts[1].sections);
  drawing.select('3');
  assert.equal(drawing.getModelParameters().cols, 11);
  assert.equal(drawing.active.sections.postR, 'C80*40*15*2.0');
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
