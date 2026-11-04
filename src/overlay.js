import * as THREE from '../vendor/three.module.js';
import { PV } from './core.js';
import './scene.js';
import './solve.js';

/* 原图叠加（侧视对照，只有图纸一）：位置按默认参数的立柱对齐。原图数据在 assets/ref-side.js */
const { MM, V, root } = PV;

// 首次打开原图对照时才加载图片数据，失败后允许重试。
let reference = null;
let pending = null;
function ensure() {
  if (reference || pending) return pending;
  pending = import('../assets/ref-side.js').then(({ default: data }) => {
    reference = data;
    root.remove(PV.state.overlay);
    build();
    PV.view.applyVisibility();
  }).catch((error) => {
    console.error('原图对照加载失败', error);
  }).finally(() => { pending = null; });
  return pending;
}

let refTexture = null;
function build() {
  const R = reference;
  const overlay = (PV.state.overlay = new THREE.Group());
  root.add(overlay);
  if (!R) return;
  if (!refTexture) {
    refTexture = new THREE.TextureLoader().load(R.src);
    refTexture.minFilter = THREE.LinearFilter;
    refTexture.generateMipmaps = false;
  }
  const k = R.mmPerPx, xf0 = PV.solve(PV.DEFAULTS).xf;
  const w = R.w * k, h = R.h * k;
  const cx = xf0 + (R.w / 2 - R.postPx[0]) * k, cy = (R.groundPx - R.h / 2) * k;
  const g = PV.track(new THREE.PlaneGeometry(w * MM, h * MM));
  const mat = PV.track(new THREE.MeshBasicMaterial({ map: refTexture, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
  const mesh = new THREE.Mesh(g, mat);
  const zs = PV.state.layout.zs;
  mesh.position.copy(V(cx, cy, zs[zs.length - 1] + 600));
  mesh.renderOrder = 900;
  PV.ewPlace(mesh, PV.state.layout.ew, zs[zs.length - 1]);   // 跟着最东一榀
  overlay.add(mesh);
}

PV.overlay = { build, ensure };
