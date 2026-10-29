/* 渲染器、相机、控制器、灯光；root 下放每次重建的模型、标注和原图叠加 */
(function () {
  'use strict';
  const PV = window.PV;

  const canvas = document.getElementById('c');
  const stage = document.getElementById('stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef2f6);
  const persp = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 2000);
  const controls = new THREE.OrbitControls(persp, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.5;
  controls.maxDistance = 300;
  controls.minZoom = 0.005;
  controls.maxZoom = 20;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb7ad94, 0.72));
  const sun = new THREE.DirectionalLight(0xffffff, 0.72);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.38);   // 东侧补光：侧视图看到的正是东立面
  fill.position.set(0.35, 0.45, 1);
  scene.add(fill);

  const root = new THREE.Group();
  scene.add(root);

  function resize() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    persp.aspect = w / h;
    persp.updateProjectionMatrix();
    ortho.left = -w / h; ortho.right = w / h; ortho.top = 1; ortho.bottom = -1;
    ortho.updateProjectionMatrix();
  }

  Object.assign(PV, { canvas, stage, renderer, scene, persp, ortho, controls, sun, root, resize });
})();
