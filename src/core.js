/* 光伏支架 3D 设计 Demo —— three.js r128（全局 THREE + THREE.OrbitControls）
 *
 * 坐标约定（与原图侧视一致）：x 向北（图右）、y 向上、z 向东（侧视图从东往西看）。
 * 图纸尺寸都用 mm，建模时乘 MM 换成米。原点 (0,0) 在组件前沿正下方的 ±0 地面。
 *
 * 代码按功能拆成多个普通脚本（不用 ES 模块，双击 index.html 走 file:// 也能打开），
 * 每个文件把自己的内容挂到全局 PV 上，加载顺序见 index.html。本文件放共用的常量、工具和运行状态。
 */
(function () {
  'use strict';

  const MM = 0.001;
  const V3 = THREE.Vector3;

  const PV = (window.PV = {
    DEG: Math.PI / 180,
    MM,
    V3,
    FONT: '"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif',
    V: (x, y, z) => new V3(x * MM, y * MM, z * MM),   // mm 坐标 → 米
    EX: new V3(1, 0, 0), EY: new V3(0, 1, 0), EZ: new V3(0, 0, 1), NZ: new V3(0, 0, -1),
    parts: {},           // 支架各构件，见 src/parts/
    disposables: [],     // 每次重建前要释放的几何体、材质、贴图
    labels: [],          // 标注文字精灵（每帧按屏幕像素调大小）
    state: {
      preset: 'A',
      view: '3d',
      jointType: 'foot',   // 节点详图：foot 斜撑-立柱，top 立柱-斜梁，btop 斜撑-斜梁，clip 檩条-斜梁，mod 檩条-组件（压块固定时为中压块），side 檩条-组件的边压块
      jointSel: 1,         // 0 前侧，1 后侧（斜撑-立柱的后侧与节点图同向）
      labelK: 1.25,        // 文字像素高度系数（手机上小一点），点击修改时输入框也按它定大小
      S: null,             // solve() 的结果
      layout: null,        // 东西向布置、连接节点、零件数量
      groups: null,        // 模型分组：model / buried / modules / hw
      dims: null,          // 标注分组
      overlay: null,
    },
  });

  PV.track = (...objs) => { PV.disposables.push(...objs); return objs[0]; };

  // 杆件：单位长度的截面几何体，靠矩阵基向量定方向、拉伸长度
  PV.addMember = function addMember(parent, geo, mat, origin, X, Y, Z) {
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    m.matrix.makeBasis(X, Y, Z).setPosition(origin);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // 连接件数量多（每榀几十个零件），全部用实例化网格
  PV.instanced = function instanced(parent, geo, mat, mats) {
    if (!mats.length) return;
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;      // 包围球按几何体原点算，不能拿来裁剪实例
    im.castShadow = true;
    im.userData.noBox = true;
    parent.add(im);
    PV.track(im);
  };
})();
