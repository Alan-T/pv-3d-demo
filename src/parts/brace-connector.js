import { braceMember } from '../brace-layout.js';
import { NZ, EY, V, MM } from '../core.js';
import * as THREE from 'three';

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

  // 孔位由求解层提供，模型、长度和标注共用坐标。
  function braceJoint(connection, T, To) {
    const { side, yc, Q, Qo, plateShift, split } = connection;
    const dbl = !!Qo, postSection = section('post', side < 0);
    const xc = connection.xc + (dbl ? 0 : side * plateShift);
    const hh = JOINT.plateH / 2, yTop = yc + hh;
    const inner = braceMember(Q, T, JOINT.braceEdge);
    const o = dbl ? braceMember(Qo, To, JOINT.braceEdge) : null;
    const shapes = [], bolts = [], boltRoles = [];
    const addPlate = (center, direction, double) => {
      const U = u => center + direction * u;
      const yc5 = yc + JOINT.chamferY;
      const pts = double
        ? [[U(-DBL.half), yTop], [U(DBL.half), yTop], [U(DBL.half), yc5], [U(DBL.botHalf), yc - hh], [U(-DBL.botHalf), yc - hh], [U(-DBL.half), yc5]]
        : [[U(-JOINT.singleBack), yc - hh], [U(JOINT.singleBot), yc - hh], [U(JOINT.singleW - JOINT.singleBack), yc5], [U(JOINT.singleW - JOINT.singleBack), yTop], [U(-JOINT.singleBack), yTop]];
      shapes.push(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * MM, y * MM))));
      bolts.push([center, yc - JOINT.boltPitch / 2], [center, yc + JOINT.boltPitch / 2]);
      boltRoles.push('post', 'post');
    };
    // 大截面带外斜撑时，两侧各使用一块单面板。
    if (split) {
      addPlate(connection.xc + side * plateShift, side, false);
      addPlate(connection.xc - side * plateShift, -side, false);
    } else addPlate(xc, side, dbl);
    bolts.push([Q.x, Q.y]); boltRoles.push('inner');
    if (o) { bolts.push([Qo.x, Qo.y]); boltRoles.push('outer'); }
    const plateGeo = track(new THREE.ExtrudeGeometry(shapes, { depth: JOINT.plateT * MM, bevelEnabled: false }));
    const width = dbl && !split ? DBL.half * 2 : JOINT.singleW;
    const spec = width + '×' + JOINT.plateH + '×' + JOINT.plateT + (split ? '（两块）' : '');
    const extent = dbl ? Math.abs(plateShift) + DBL.half : JOINT.singleW - JOINT.singleBack;
    return { ...inner, B: Q, side, postSection, xc, yc, hh, yTop, plateGeo, bolts, boltRoles, o, spec, split, extent };
  }
  function build(c, J, z0) {
    const { zw } = c;
    const plate = new THREE.Mesh(J.plateGeo, bracketMaterial);
    plate.position.z = (z0 + zw) * MM;
    plate.castShadow = plate.receiveShadow = true;
    c.hw.add(plate);
    // 连接板外侧放螺栓头，螺母及平垫/弹垫在杆件槽内。
    J.bolts.forEach(([x, y], i) => {
      const role = J.boltRoles[i];
      const thickness = role === 'post' ? J.postSection.t : section('brace', J.side < 0, role === 'outer').t;
      c.bolts.add(role === 'post' ? 'foot' : 'footBrace', V(x, y, z0 + zw - thickness), NZ, EY, thickness);
    });
  }
    Object.assign(this, { braceJoint, build });
  }
}
