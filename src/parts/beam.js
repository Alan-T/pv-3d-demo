/* 斜梁：每榀一根，搭在前后立柱上；立柱在斜梁上居中。
 * 立柱-斜梁节点：斜梁腹板贴立柱腹板，1 颗 M12 在立柱中心线上、孔心距柱顶 50，立柱腹板上开竖向长圆孔；柱顶平切 */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, V, EY, EZ, FIX, M, addMember } = PV;

  const geo = PV.extrudeC(FIX.beam);

  function build(c) {
    const { S, layout, zw, u, n } = c;
    const b0 = S.along(0);
    for (const z0 of layout.zs) {
      addMember(c.model, geo, M.beam, V(b0.x, b0.y, z0 + zw), n, EZ, u.clone().multiplyScalar(S.beamLen * MM));
      c.bolts.add('top', V(S.xf, S.holeF, z0 + c.zBeamWeb), EZ, EY);
      c.bolts.add('top', V(S.xr, S.holeR, z0 + c.zBeamWeb), EZ, EY);
    }
  }

  PV.parts.beam = { build };
})();
