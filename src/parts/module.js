/* 光伏组件：沿坡 rows 块竖排，东西向 cols 列。螺栓固定时每块 4 颗 M8 安装螺栓（两根檩条 × 两条长边框），
 * 用安装孔压在檩条上翼缘，螺母在檩条上翼缘下面；压块固定见 clamp.js */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, V, EZ, FIX } = PV;

  // 第 r 排组件在东西向 z 处的中心（组件厚度中面）
  function center(c, r, z) {
    const { P, S, n } = c, p = S.along(S.modStarts[r] + P.modL / 2);
    return V(p.x, p.y, z).addScaledVector(n, (S.hModBot + P.modT / 2) * MM);
  }

  function build(c) {
    const { P, S, layout, u, n } = c;
    const modGeo = PV.track(new THREE.BoxGeometry(P.modL * MM, P.modT * MM, P.modW * MM));   // 组件长度可改，每次重建
    S.modStarts.forEach((m0, r) => {
      for (let j = 0; j < layout.cols; j++) {
        const z = -layout.arrW / 2 + j * layout.pitchEW + P.modW / 2;
        const mesh = new THREE.Mesh(modGeo, PV.modMats);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.makeBasis(u, n, EZ).setPosition(center(c, r, z));
        mesh.castShadow = mesh.receiveShadow = true;
        c.modules.add(mesh);
        if (P.fix === 'clamp') continue;
        for (const t of [S.purlins[2 * r], S.purlins[2 * r + 1]]) {
          const q = S.along(t);
          for (const k of [-1, 1]) {
            c.bolts.add('module', V(q.x, q.y, z + k * (P.modW / 2 - 18)).addScaledVector(n, (S.hModBot - FIX.purlin.t) * MM),
              n.clone().negate(), u);
          }
        }
      }
    });
  }

  // 剖切面封口：东西向 z 处切到的那一列组件，每排补一块 组件长 × 厚 的截面；z 落在组件缝里就没有
  function cap(c, z, parent) {
    const { P, layout } = c;
    const j = Math.floor((z + layout.arrW / 2) / layout.pitchEW), z0 = -layout.arrW / 2 + j * layout.pitchEW;
    if (j < 0 || j >= layout.cols || z >= z0 + P.modW) return;
    const geo = PV.track(new THREE.PlaneGeometry(P.modL * MM, P.modT * MM));
    c.S.modStarts.forEach((m0, r) => {
      const mesh = new THREE.Mesh(geo, PV.M.moduleCap);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.makeBasis(c.u, c.n, EZ).setPosition(center(c, r, z));
      parent.add(mesh);
    });
  }

  PV.parts.module = { build, cap };
})();
