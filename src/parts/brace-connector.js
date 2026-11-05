import { NZ, EY, V, MM } from '../core.js';
import * as THREE from '../../vendor/three.module.js';

/** 构件实例：构造参数配置本构件，build 接收本次支架的放置上下文。 */
export class BraceConnectorPart {
  constructor({
    bracketMaterial,
    DBL,
    JOINT,
    postFSection,
    postRSection,
    braceFSection,
    braceRSection,
    braceOFSection,
    braceORSection,
    track,
  }) {
  const section = (kind, rear = false, outer = false) => kind === 'post'
    ? (rear ? postRSection : postFSection)
    : (outer ? (rear ? braceORSection : braceOFSection) : (rear ? braceRSection : braceFSection));
  // 斜撑连接板：节点几何、孔位及连接螺栓。

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
    const postSection = section('post', side < 0);
    const xc = B.x - (side * postSection.d) / 2, yc = B.y;
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
    const plateGeo = track(new THREE.ExtrudeGeometry(shape, { depth: JOINT.plateT * MM, bevelEnabled: false }));
    const inner = braceEnds(Q, T), o = dbl ? braceEnds(Qo, To) : null;
    const bolts = [[xc, yc - JOINT.boltPitch / 2], [xc, yc + JOINT.boltPitch / 2], [Q.x, Q.y]];
    if (o) bolts.push([o.Q.x, o.Q.y]);
    const spec = `${dbl ? DBL.half * 2 : JOINT.singleW}×${JOINT.plateH}×${JOINT.plateT}`;
    return { ...inner, B, side, postSection, xc, yc, hh, yTop, plateGeo, bolts, o, spec };
  }

  function build(c, J, z0) {
    const { zw } = c;
    const plate = new THREE.Mesh(J.plateGeo, bracketMaterial);
    plate.position.z = (z0 + zw) * MM;
    plate.castShadow = plate.receiveShadow = true;
    c.hw.add(plate);
    // 连接板外侧放螺栓头，螺母及平垫/弹垫在杆件槽内。
    J.bolts.forEach(([x, y], i) => {
      const thickness = i < 2 ? J.postSection.t : (i === 3 ? section('brace', J.side < 0, true).t : section('brace', J.side < 0).t);
      c.bolts.add(i < 2 ? 'foot' : 'footBrace', V(x, y, z0 + zw - thickness), NZ, EY, thickness);
    });
  }
    Object.assign(this, { braceJoint, build });
  }
}
