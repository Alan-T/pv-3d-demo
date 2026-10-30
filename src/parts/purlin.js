/* 檩条和檩托。檩条坐在斜梁上表面，沿东西向通长。
 * 檩条-斜梁：L 形檩托，底边压在斜梁上翼缘、立边贴檩条腹板（下坡一侧），各 1 颗 M12 */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, V, EZ, FIX, CLIP, M, addMember } = PV;

  const geo = PV.extrudeC(FIX.purlin);
  const capGeo = new THREE.ShapeGeometry(PV.cShape(FIX.purlin));
  // 檩托截面：局部 x 从檩条腹板外表面往下坡，局部 y 从斜梁上表面往上；沿局部 z 拉伸单位长度
  const clipGeo = (() => {
    const t = CLIP.t * MM, a = CLIP.base * MM, h = CLIP.height * MM;
    const s = new THREE.Shape([[0, 0], [a, 0], [a, t], [t, t], [t, h], [0, h]].map((q) => new THREE.Vector2(q[0], q[1])));
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  })();

  // 檩条 t（距斜梁下端）在东西向 z 处的截面原点：截面局部 a 沿 n、b 沿 u，腹板在下坡一侧
  function origin(c, t, z) {
    const p = c.S.along(t);
    return V(p.x, p.y, z)
      .addScaledVector(c.n, (c.S.hBeamTop + FIX.purlin.d / 2) * MM)
      .addScaledVector(c.u, (-FIX.purlin.f / 2) * MM);
  }

  // 返回檩托个数
  function build(c) {
    const { S, layout, zw, u, n } = c;
    const zClip = zw + FIX.beam.f / 2;         // 斜梁上翼缘中线，檩托居中
    // 檩托：每根檩条与每榀斜梁相交处一个，立边贴檩条腹板外表面（下坡一侧）
    const clipMats = [];
    for (const z0 of layout.zs) {
      for (const t of S.purlins) {
        const q = S.along(t);
        const at = (du, dn, dz) => V(q.x, q.y, z0 + dz)
          .addScaledVector(u, (-FIX.purlin.f / 2 + du) * MM)
          .addScaledVector(n, (S.hBeamTop + dn) * MM);
        // 局部 x 朝下坡、y 朝上；z 取 −z 方向保证右手系（实例矩阵不能带镜像）
        clipMats.push(new THREE.Matrix4()
          .makeBasis(u.clone().negate(), n, EZ.clone().multiplyScalar(-CLIP.width * MM))
          .setPosition(at(0, 0, zClip + CLIP.width / 2)));
        c.bolts.add('clip', at(-CLIP.baseBolt, CLIP.t, zClip), n, u);
        c.bolts.add('clip', at(-CLIP.t, CLIP.webBolt, zClip), u.clone().negate(), n);
      }
    }
    PV.instanced(c.hw, clipGeo, M.clip, clipMats);

    for (const t of S.purlins) {
      addMember(c.slope, geo, M.purlin, origin(c, t, -layout.purlinLen / 2), n, u, EZ.clone().multiplyScalar(layout.purlinLen * MM));
    }
    return clipMats.length;
  }

  // 剖切面封口：在东西向 z 处给每根檩条补一块 C 型截面
  function cap(c, z, parent) {
    if (Math.abs(z) >= c.layout.purlinLen / 2) return;
    for (const t of c.S.purlins) addMember(parent, capGeo, M.purlinCap, origin(c, t, z), c.n, c.u, EZ);
  }

  PV.parts.purlin = { build, cap };
})();
