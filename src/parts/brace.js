/* 斜撑（内斜撑，可选外斜撑）和斜撑下端连接板。
 * 斜撑-立柱：连接板贴在立柱腹板外侧，2 颗螺栓（立柱中心线上，上下排）接立柱；板向斜撑一侧伸出，
 *   斜撑腹板贴在伸出部分上用 1 颗螺栓；单面板伸出部分的下角斜切。螺栓孔为竖向长圆孔。
 * 斜撑-斜梁：斜撑腹板贴斜梁腹板，两条中心线交点 1 颗螺栓；斜撑端头平切。斜撑两端孔心到端头都是 35 */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, V3, V, EY, EZ, NZ, FIX, JOINT, DBL, M, addMember } = PV;

  const geo = PV.extrudeC(FIX.brace);

  // 实际斜撑：从连接板上的螺栓 Q 连到斜梁节点 T，两端端头（垂直切口）都在孔心外 braceEdge：下端 E 在 Q 下方，上端过 T
  function braceEnds(Q, T) {
    const dx = T.x - Q.x, dy = T.y - Q.y, len = Math.hypot(dx, dy);
    const ax = dx / len, ay = dy / len, eTop = JOINT.braceEdge;
    const E = { x: Q.x - ax * JOINT.braceEdge, y: Q.y - ay * JOINT.braceEdge };
    return { T, E, Q, ax, ay, eTop, len: len + JOINT.braceEdge + eTop };
  }

  // 斜撑下端连接板。B：内斜撑理论节点（立柱内侧面，高 braceH）；T：内斜撑上节点；Bo/To：外斜撑（可无）。
  // 连接板竖向中点（= 两颗立柱螺栓的中点）就在 braceH，也就是图上“离地 250 / 350”标的位置。
  // 只有内斜撑：单面五边形板 160×120，斜撑一侧竖直板边高 55，斜切到宽 50 的下边；
  // 带外斜撑：对称六边形双面板 280×120（Bracing Connector），两侧竖直板边高 55，斜切到宽 60 的下边。
  // 孔位两种板相同：立柱中心线上 2 孔（间距 boltPitch），斜撑孔离立柱中心 ±boltU、比两立柱孔中点高 rise
  function braceJoint(S, B, T, Bo, To) {
    const dbl = !!Bo, side = Math.sign(T.x - B.x);            // +1 前柱（内斜撑向北），−1 后柱
    const xc = B.x - (side * FIX.post.d) / 2, yc = B.y;
    const hh = JOINT.plateH / 2, yTop = yc + hh;
    const U = (u) => xc + side * u;                             // u：离立柱中心线、朝内斜撑一侧的水平距离
    let pts, Qo = null;
    const yc5 = yc + JOINT.chamferY;
    if (!dbl) {
      const back = -JOINT.singleBack, out = JOINT.singleW - JOINT.singleBack;
      pts = [[U(back), yc - hh], [U(JOINT.singleBot), yc - hh], [U(out), yc5], [U(out), yTop], [U(back), yTop]];
    } else {
      pts = [[U(-DBL.half), yTop], [U(DBL.half), yTop], [U(DBL.half), yc5], [U(DBL.botHalf), yc - hh],
        [U(-DBL.botHalf), yc - hh], [U(-DBL.half), yc5]];
      Qo = { x: U(-JOINT.boltU), y: yc + JOINT.rise };
    }
    const Q = { x: U(JOINT.boltU), y: yc + JOINT.rise };
    const shape = new THREE.Shape(pts.map((q) => new THREE.Vector2(q[0] * MM, q[1] * MM)));
    const plateGeo = PV.track(new THREE.ExtrudeGeometry(shape, { depth: JOINT.plateT * MM, bevelEnabled: false }));
    const inner = braceEnds(Q, T), o = dbl ? braceEnds(Qo, To) : null;
    const bolts = [[xc, yc - JOINT.boltPitch / 2], [xc, yc + JOINT.boltPitch / 2], [Q.x, Q.y]];
    if (o) bolts.push([o.Q.x, o.Q.y]);
    const spec = `${dbl ? DBL.half * 2 : JOINT.singleW}×${JOINT.plateH}×${JOINT.plateT}`;
    return { ...inner, B, side, xc, yc, hh, yTop, plateGeo, bolts, o, spec };
  }

  // 前柱、后柱两处斜撑节点（各榀相同）；标注、节点详图和面板也用
  function joints(S) {
    const O = S.outer;
    return [braceJoint(S, S.bF, S.tFp, O && O.oF, O && O.toFp), braceJoint(S, S.bR, S.tRp, O && O.oR, O && O.toRp)];
  }

  // 斜撑腹板、立柱腹板外表面都在 z0+zw 平面，连接板压在两者外侧
  function build(c) {
    const { layout, zw, u } = c;
    for (const z0 of layout.zs) {
      for (const J of layout.joints) {
        for (const b of J.o ? [J, J.o] : [J]) {
          addMember(c.model, geo, M.brace, V(b.E.x, b.E.y, z0 + zw),
            new V3(-b.ay, b.ax, 0), NZ, new V3(b.ax, b.ay, 0).multiplyScalar(b.len * MM));
          c.bolts.add('btop', V(b.T.x, b.T.y, z0 + c.zBeamWeb), EZ, u);
        }
        const plate = new THREE.Mesh(J.plateGeo, M.bracket);
        plate.position.z = (z0 + zw) * MM;
        plate.castShadow = plate.receiveShadow = true;
        c.hw.add(plate);
        for (const [x, y] of J.bolts) c.bolts.add('foot', V(x, y, z0 + zw + JOINT.plateT), EZ, EY);
      }
    }
  }

  PV.parts.brace = { joints, build };
})();
