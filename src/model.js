/* 整体重建：改任何参数都重新求几何、依次搭各构件，再画标注、刷新视图和面板 */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, V3, FIX, M, root, parts } = PV;

  function clearDynamic() {
    for (const d of PV.disposables) d.dispose();
    PV.disposables.length = 0;
    PV.labels.length = 0;
    while (root.children.length) root.remove(root.children[0]);
  }

  // 地面：过前柱脚，按坡度绕 z 轴倾斜
  function buildGround(S, layout) {
    const gSize = Math.max(40, layout.arrW * MM + 24);
    const gg = PV.track(new THREE.PlaneGeometry(gSize, gSize));
    gg.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(gg, M.ground);
    ground.position.set(S.xf * MM, 0, 0);
    ground.rotation.z = Math.atan(S.sp);
    ground.receiveShadow = true;
    M.ground.map.repeat.set(gSize, gSize);
    root.add(ground);
  }

  PV.build = function build() {
    const st = PV.state, P = PV.P;
    // 先记下旧几何下的取景，重建后让垂直组件 / 节点视图跟着新几何走
    const oldPose = PV.view.savePose();
    clearDynamic();
    const S = (st.S = PV.solve(P));
    const layout = (st.layout = PV.layoutEW(P));
    layout.joints = parts.brace.joints(S);

    const g = (st.groups = {
      model: new THREE.Group(),
      buried: new THREE.Group(),
      modules: new THREE.Group(),
      hw: new THREE.Group(),          // 连接件：螺栓、连接板、檩托
    });
    g.model.add(g.buried, g.modules, g.hw);

    // 各构件共用的构建上下文：u 沿坡向上、n 垂直斜梁向上；zw 是立柱腹板所在平面（框架平面东侧），
    // zBeamWeb 是斜梁腹板内表面（相对榀位 z0），柱顶、撑顶螺栓的螺母在这一侧
    const zw = FIX.post.f / 2;
    const bolts = parts.bolts.collector();
    const c = {
      P, S, layout, bolts, ...g,
      u: new V3(S.c, S.s, 0), n: new V3(-S.s, S.c, 0),
      zw, zBeamWeb: zw + FIX.beam.t,
    };
    parts.post.build(c);
    parts.beam.build(c);
    parts.brace.build(c);
    const clip = parts.purlin.build(c);
    parts.module.build(c);
    layout.counts = Object.assign({ clip }, bolts.flush(g.hw));
    root.add(g.model);

    buildGround(S, layout);
    PV.dims.build();
    PV.overlay.build();
    PV.view.applyVisibility();
    PV.view.placeSun();
    PV.panel.update();
    PV.view.follow(oldPose);
  };
})();
