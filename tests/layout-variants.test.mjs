import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESETS } from '../src/config.js';
import { DrawingLayouts } from '../src/layout-variants.js';

test('图纸各自保留排布列表；组件尺寸和倾角共享，东西向布置与构件截面独立', () => {
  const a = new DrawingLayouts(PRESETS.A), b = new DrawingLayouts(PRESETS.B);
  assert.deepEqual(a.layouts.map(item => item.parameters.cols), [26, 13]);
  assert.deepEqual(b.layouts.map(item => item.parameters.cols), [27, 14]);

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
  assert.equal(PRESETS.A.layouts[0].parameters.cols, 26);
});

test('从预设逐项读取排布套数、参数和截面，恢复时取稳定标识对应的预设', () => {
  const layouts = [
    { quantity: 4, parameters: { cols: 29, pitch: 2500, offset: 11 }, sections: { beam: 'C80' } },
    { quantity: 7, parameters: { cols: 21, pitch: 2800, offset: 12 }, sections: { beam: 'C90' } },
    { quantity: 2, parameters: { cols: 9, pitch: 3100, offset: 13 }, sections: { beam: 'C100' } },
  ];
  const drawing = new DrawingLayouts({ projectInfo: {}, tilt: 25, layouts });
  assert.deepEqual(drawing.layouts.map(({ quantity, parameters, sections }) => ({ quantity, parameters, sections })), layouts);
  drawing.select('3');
  drawing.captureParameters({ ...drawing.getModelParameters(), tilt: 20, offset: 20 });
  drawing.setQuantity(8);
  drawing.active.sections.beam = 'C120';
  assert.equal(drawing.getModelParameters().offset, 20);
  assert.equal(layouts[2].parameters.offset, 13);
  assert.equal(layouts[2].sections.beam, 'C100');
  drawing.select('2');
  assert.deepEqual(drawing.getModelParameters(), { tilt: 20, ...layouts[1].parameters });
  drawing.select('3');
  drawing.remove('1');
  drawing.reset();
  assert.equal(drawing.active.label, '排布2');
  assert.equal(drawing.active.quantity, 8);
  assert.deepEqual(drawing.getModelParameters(), { tilt: 25, ...layouts[2].parameters });
  assert.deepEqual(drawing.active.sections, layouts[2].sections);

  drawing.add();
  assert.equal(drawing.activeId, '4');
  drawing.reset();
  assert.equal(drawing.active.quantity, 1);
  assert.deepEqual(drawing.active.parameters, layouts[0].parameters);
  assert.deepEqual(drawing.active.sections, layouts[0].sections);
});

test('只有一条排布预设时可直接使用和新增', () => {
  const drawing = new DrawingLayouts({ ...PRESETS.B, layouts: [PRESETS.B.layouts[1]] });
  assert.deepEqual(drawing.layouts.map(item => item.id), ['1']);
  assert.equal(drawing.remove('1'), false);
  drawing.add();
  assert.equal(drawing.activeId, '2');
  assert.deepEqual(drawing.active.parameters, PRESETS.B.layouts[1].parameters);
  drawing.reset();
  assert.deepEqual(drawing.active.parameters, PRESETS.B.layouts[1].parameters);
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
  assert.deepEqual(drawing.active.parameters.postTieSpansR, [1, 0]);
  drawing.active.parameters.postTieSpansR[1] = 1;
  drawing.active.sections.postR = 'C80*40*15*2.0';

  drawing.select('2');
  assert.deepEqual(drawing.active.parameters.postTieSpansR, [1, 0]);
  assert.equal(drawing.active.sections.postR, 'C80*40*15*3.0');
  assert.equal(drawing.active.quantity, 8);
  drawing.reset();
  assert.equal(drawing.getModelParameters().tilt, PRESETS.A.tilt);
  assert.equal(drawing.getModelParameters().cols, 13);
  assert.equal(drawing.active.quantity, 8);
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
  assert.equal(drawing.active.parameters.cols, 13);
  assert.equal(drawing.active.quantity, 7);
  drawing.add();
  assert.deepEqual(drawing.layouts.map(({ id, label }) => [id, label]), [
    ['2', '排布1'], ['3', '排布2'], ['4', '排布3'],
  ]);
});
