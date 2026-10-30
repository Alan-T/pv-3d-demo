/* 启动和渲染循环（最后加载） */
(function () {
  'use strict';
  const PV = window.PV;
  const { renderer, scene, stage } = PV;

  PV.panel.init();
  PV.resize();
  PV.build();
  PV.view.set('3d', true);

  function draw() {
    PV.dims.updateLabels(PV.view.camera);
    PV.edit.update();
    renderer.render(scene, PV.view.camera);
  }
  // 画布尺寸一变（收起 / 展开面板、底部抽屉开合、窗口缩放）就马上重画：改尺寸会清空画布，
  // 尺寸回调在本帧的渲染之后、上屏之前，等下一帧再画模型会消失一下
  const onResize = (PV.fitCanvas = () => { if (PV.resize()) draw(); });
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(stage);
  else window.addEventListener('resize', onResize);

  const loading = document.getElementById('loading');
  function loop(now) {
    requestAnimationFrame(loop);
    PV.view.tick(now);
    draw();
    if (loading) loading.classList.add('done');   // 第一帧画好了，淡出“正在加载”
  }
  requestAnimationFrame(loop);

  // 调试/测试用
  const st = PV.state;
  window.pvDemo = {
    P: PV.P, show: PV.show, solve: PV.solve, setView: PV.view.set, rebuild: PV.build, controls: PV.controls,
    labels: PV.labels, pickLabel: PV.edit.pickLabel,
    get camera() { return PV.view.camera; },
    get state() { return { S: st.S, layout: st.layout, view: st.view, cam: PV.view.camera.type }; },
  };
})();
