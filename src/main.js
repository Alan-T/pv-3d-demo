import { scene, stage, renderer, resize, controls } from './scene.js';
import { shared } from './core.js';
import { solve } from './solve.js';
import { P, show } from './config.js';
import { build } from './model.js';
import { update as editUpdate, pickLabel as editPickLabel } from './edit.js';
import { updateLabels as dimsUpdateLabels } from './dims.js';
import { setView as viewSetView, getCamera, tick as viewTick } from './view.js';
import { init as panelInit } from './panel.js';

/* 启动和渲染循环（最后加载） */

panelInit();
resize();
build();
viewSetView('3d', true);

function draw() {
  dimsUpdateLabels(getCamera());
  editUpdate();
  renderer.render(scene, getCamera());
}
// 画布尺寸一变（收起 / 展开面板、底部抽屉开合、窗口缩放）就马上重画：改尺寸会清空画布，
// 尺寸回调在本帧的渲染之后、上屏之前，等下一帧再画模型会消失一下
const onResize = (shared.fitCanvas = () => { if (resize()) draw(); });
if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(stage);
else window.addEventListener('resize', onResize);

const loading = document.getElementById('loading');
function loop(now) {
  requestAnimationFrame(loop);
  viewTick(now);
  draw();
  if (loading) loading.classList.add('done');   // 第一帧画好了，淡出“正在加载”
}
requestAnimationFrame(loop);

// 调试/测试用
const st = shared.state;
window.pvDemo = {
  P: P, show: show, solve: solve, setView: viewSetView, rebuild: build, controls: controls,
  labels: shared.labels, pickLabel: editPickLabel,
  get camera() { return getCamera(); },
  get state() { return { S: st.S, layout: st.layout, view: st.view, cam: getCamera().type }; },
};
