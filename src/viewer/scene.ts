import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';

/* 渲染器、相机、控制器、灯光；root 下放每次重建的模型、标注 */

function createScene(canvas: HTMLCanvasElement, stage: HTMLElement) {
  // alpha：画布在第一帧画出来之前是透明的，露出页面底色和“正在加载”；不透明的 WebGL 画布在这之前是一大片黑
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  let controls: OrbitControls | undefined;
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f6);
    const persp = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 2000);
    controls = new OrbitControls(persp, canvas);
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
    return { canvas, stage, renderer, scene, persp, ortho, controls, sun, root };
  } catch (error) {
    controls?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
}

export function createSceneController() {
  let current: ReturnType<typeof createScene> | null = null;

  function tryGetScene() {
    return current;
  }

  function getScene() {
    if (!current) throw new Error('场景尚未初始化');
    return current;
  }

  function initScene(canvas: HTMLCanvasElement, stage: HTMLElement) {
    current = createScene(canvas, stage);
    lastW = 0;
    lastH = 0;
    return current;
  }

  function disposeScene() {
    if (!current) return;
    const { controls, sun, renderer, scene, root } = current;
    current = null;
    controls.dispose();
    if (sun.shadow.map instanceof THREE.WebGLRenderTarget) sun.shadow.map.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    scene.clear();
    root.clear();
  }

  // 改画布尺寸会清空画布，尺寸没变就不动（返回是否改了）
  let lastW = 0, lastH = 0;
  function resize() {
    const { stage, renderer, persp, ortho } = getScene();
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

  return { initScene, disposeScene, getScene, tryGetScene, resize };
}

export type SceneController = ReturnType<typeof createSceneController>;
