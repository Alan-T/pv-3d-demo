import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrthographicCamera, Sprite } from 'three';
import { shared } from '../src/core.js';
import { updateLabels } from '../src/dims.js';

test('榀距标注在临界缩放时整组切换，放大后恢复逐跨尺寸', (t) => {
  const camera = new OrthographicCamera(-100, 100, 100, -100);
  const viewport = { clientWidth: 1600, clientHeight: 1000 };
  const summary = new Sprite(), endBay = new Sprite(), middleBay = new Sprite();
  summary.userData = { px: 10, aspect: 8, altFor: 'pitch' };
  endBay.userData = { px: 10, aspect: 1, fit: { span: 2.5, key: 'pitch' } };
  middleBay.userData = { px: 10, aspect: 1, fit: { span: 2.8, key: 'pitch' } };
  const labels = [endBay, middleBay, summary];
  const start = shared.labels.length;
  shared.labels.push(...labels);
  t.after(() => shared.labels.splice(start, labels.length));

  // zoom=1 时文字宽 2.5 m：中间跨放得下，首末跨放不下。
  for (const [zoom, individual] of [[2, true], [1, false], [0.5, false], [2, true]]) {
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    updateLabels(camera, viewport);
    assert.deepEqual(labels.map(label => label.visible), [individual, individual, !individual]);
  }
});
