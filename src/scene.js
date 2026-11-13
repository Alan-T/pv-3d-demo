import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';

/* 渲染器、相机、控制器、灯光；root 下放每次重建的模型、标注 */

let canvas, stage, renderer, scene, persp, ortho, controls, sun, root;

function initScene(canvasElement, stageElement) {
  canvas = canvasElement;
  stage = stageElement;
  // alpha：画布在第一帧画出来之前是透明的，露出页面底色和“正在加载”；不透明的 WebGL 画布在这之前是一大片黑
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef2f6);
  persp = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
  ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 2000);
  controls = new OrbitControls(persp, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.5;
  controls.maxDistance = 300;
  controls.minZoom = 0.005;
  controls.maxZoom = 20;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb7ad94, 0.72));
  sun = new THREE.DirectionalLight(0xffffff, 0.72);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.38);   // 东侧补光：侧视图看到的正是东立面
  fill.position.set(0.35, 0.45, 1);
  scene.add(fill);

  root = new THREE.Group();
  scene.add(root);
  lastW = 0;
  lastH = 0;
}

function disposeScene() {
  controls?.dispose();
  sun?.shadow.map?.dispose();
  renderer?.dispose();
  renderer?.forceContextLoss();
  scene?.clear();
  canvas = stage = renderer = scene = persp = ortho = controls = sun = root = null;
}

// 改画布尺寸会清空画布，尺寸没变就不动（返回是否改了）
let lastW = 0, lastH = 0;
function resize() {
  const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
  if (w === lastW && h === lastH) return false;
  lastW = w; lastH = h;
  renderer.setSize(w, h, false);
  persp.aspect = w / h;
  persp.updateProjectionMatrix();
  ortho.left = -w / h; ortho.right = w / h; ortho.top = 1; ortho.bottom = -1;
  ortho.updateProjectionMatrix();
  return true;
}

export { canvas, stage, renderer, scene, persp, ortho, controls, sun, root, resize, initScene, disposeScene };
