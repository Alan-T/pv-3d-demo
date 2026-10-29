/* 原图叠加（侧视对照，只有图纸一）：位置按默认参数的立柱对齐。原图数据在 assets/ref-side.js */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, V, root } = PV;

  let refTexture = null;
  function build() {
    const R = window.PV_REF_SIDE;
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
    overlay.add(mesh);
  }

  PV.overlay = { build };
})();
