/* 立柱：每榀前、后各一根 C 型钢，柱顶平切、与斜梁上表面齐平；地面以下单独一段（埋地部分，可隐藏） */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, V, EX, EY, NZ, FIX, M, addMember } = PV;

  const geo = PV.extrudeC(FIX.post);

  // c：model.js 里的构建上下文
  function build(c) {
    const { S, layout, zw } = c;
    const post = (x, yBot, yTop, yG, z0) => {
      const cut = Math.min(Math.max(yG, yBot), yTop);
      if (yTop - cut > 1) addMember(c.model, geo, M.post, V(x, cut, z0 + zw), EX, NZ, EY.clone().multiplyScalar((yTop - cut) * MM));
      if (cut - yBot > 1) addMember(c.buried, geo, M.buried, V(x, yBot, z0 + zw), EX, NZ, EY.clone().multiplyScalar((cut - yBot) * MM));
    };
    for (const z0 of layout.zs) {
      post(S.xf, S.botF, S.topF, S.gy(S.xf), z0);
      post(S.xr, S.botR, S.topR, S.gy(S.xr), z0);
    }
  }

  PV.parts.post = { build };
})();
