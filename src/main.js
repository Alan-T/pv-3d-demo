/* 启动和渲染循环（最后加载） */
(function () {
  'use strict';
  const PV = window.PV;
  const { renderer, scene, stage } = PV;

  PV.panel.init();
  PV.resize();
  PV.build();
  PV.view.set('3d', true);
  if ('ResizeObserver' in window) new ResizeObserver(PV.resize).observe(stage);
  else window.addEventListener('resize', PV.resize);

  const loading = document.getElementById('loading');
  function loop(now) {
    requestAnimationFrame(loop);
    PV.view.tick(now);
    PV.dims.updateLabels(PV.view.camera);
    PV.edit.update();
    renderer.render(scene, PV.view.camera);
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
