/* 光伏组件：沿坡 rows 块竖排，东西向 cols 列；每块 4 颗 M8 安装螺栓（两根檩条 × 两条长边框），
 * 用安装孔压在檩条上翼缘，螺母在檩条上翼缘下面 */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, V, EZ, FIX } = PV;

  function build(c) {
    const { P, S, layout, u, n } = c;
    const modGeo = PV.track(new THREE.BoxGeometry(P.modL * MM, FIX.modT * MM, FIX.modW * MM));   // 组件长度可改，每次重建
    S.modStarts.forEach((m0, r) => {
      const p = S.along(m0 + P.modL / 2);
      for (let j = 0; j < layout.cols; j++) {
        const z = -layout.arrW / 2 + j * layout.pitchEW + FIX.modW / 2;
        const mesh = new THREE.Mesh(modGeo, PV.modMats);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.makeBasis(u, n, EZ).setPosition(V(p.x, p.y, z).addScaledVector(n, (S.hModBot + FIX.modT / 2) * MM));
        mesh.castShadow = mesh.receiveShadow = true;
        c.modules.add(mesh);
        for (const t of [S.purlins[2 * r], S.purlins[2 * r + 1]]) {
          const q = S.along(t);
          for (const k of [-1, 1]) {
            c.bolts.add('module', V(q.x, q.y, z + k * (FIX.modW / 2 - 18)).addScaledVector(n, (S.hModBot - FIX.purlin.t) * MM),
              n.clone().negate(), u);
          }
        }
      }
    });
  }

  PV.parts.module = { build };
})();
