import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeContext } from '../src/viewer/runtime-context.ts';
import { createMaterials } from '../src/viewer/materials.ts';
import { createSceneController } from '../src/viewer/scene.ts';
import { createLayoutController } from '../src/app/layout-controller.ts';
import { buildSnapshot } from '../src/app/designer-snapshot.ts';

test('同页的设计器分别持有排布、参数和模型资源', () => {
  const first = createRuntimeContext();
  const second = createRuntimeContext();
  const actions = { closeEdit() {}, rebuild() {}, publish() {} };
  const firstLayouts = createLayoutController(first, actions);
  const secondLayouts = createLayoutController(second, actions);
  const firstMaterials = createMaterials(first, createSceneController());
  const secondMaterials = createMaterials(second, createSceneController());
  try {
    const original = buildSnapshot(second, secondLayouts.currentDrawing(), false);
    firstLayouts.addLayout();
    first.parameters.cols = 9;
    firstLayouts.syncParameters();
    first.display.drawingColors = false;
    firstMaterials.applyPalette();
    secondMaterials.applyPalette();
    assert.notEqual(firstMaterials.M.post.color.getHex(), secondMaterials.M.post.color.getHex());
    first.track(firstMaterials.M.beam);
    assert.equal(second.disposables.length, 0);
    firstLayouts.applyPreset('B');
    assert.deepEqual(buildSnapshot(second, secondLayouts.currentDrawing(), false), original);
    firstLayouts.applyPreset('A');
    assert.equal(first.parameters.cols, 9);
    assert.equal(firstLayouts.currentDrawing().layouts.length, 3);
    firstLayouts.resetPreset();
    assert.deepEqual(firstLayouts.currentDrawing().layouts, original.layouts);
  } finally {
    firstMaterials.disposeMaterials();
    secondMaterials.disposeMaterials();
  }
});
