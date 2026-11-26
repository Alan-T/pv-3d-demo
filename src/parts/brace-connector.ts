import type { PartOptions, BuildContext } from '../part-types.ts';
import { braceMember, type braceConnection, type FramePoint } from '../brace-layout.ts';
import { BRACE_JOINT, getBraceConnectorPlate } from '../brace-connector-spec.ts';
import { FIX } from '../config.ts';
import { NZ, EY, V, MM } from '../core.ts';
import * as THREE from 'three';

/** 构件实例：构造参数配置本构件，build 接收本次支架的放置上下文。 */
export class BraceConnectorPart {
  braceJoint;
  build;

  constructor({
    bracketMaterial,
    plates,
    postFSection,
    postRSection,
    braceFSection,
    braceRSection,
    braceOFSection,
    braceORSection,
    track,
  }: PartOptions['brace']['braceConnector']) {
  const section = (kind: 'post' | 'brace', rear = false, outer = false) => kind === 'post'
    ? (rear ? postRSection : postFSection)
    : (outer ? (rear ? braceORSection : braceOFSection) : (rear ? braceRSection : braceFSection));
  // 斜撑连接板：节点几何、孔位及连接螺栓。

  // 孔位由求解层提供，模型、长度和标注共用坐标。
  function braceJoint(connection: ReturnType<typeof braceConnection>, T: FramePoint, To?: FramePoint | null) {
    const { side, yc, Q, Qo, plateShift, split } = connection;
    const dbl = !!Qo, postSection = section('post', side < 0);
    const xc = connection.xc + (dbl ? 0 : side * plateShift);
    const doublePlate = dbl && !split;
    const plate = getBraceConnectorPlate(dbl, split, plates);
    const hh = plate.height / 2, yTop = yc + hh;
    const { singleBack, singleBot, doubleBottomHalf, chamferY, boltPitch } = BRACE_JOINT;
    const reach = doublePlate ? plate.width / 2 : plate.width - singleBack;
    const inner = braceMember(Q, T, FIX.braceEdge);
    const o = Qo && To ? braceMember(Qo, To, FIX.braceEdge) : null;
    const shapes: THREE.Shape[] = [], bolts: [number, number][] = [], boltRoles: string[] = [];
    const addPlate = (center: number, direction: number) => {
      const U = (u: number) => center + direction * u;
      const yc5 = yc + chamferY;
      const pts = doublePlate
        ? [[U(-reach), yTop], [U(reach), yTop], [U(reach), yc5], [U(doubleBottomHalf), yc - hh], [U(-doubleBottomHalf), yc - hh], [U(-reach), yc5]]
        : [[U(-singleBack), yc - hh], [U(singleBot), yc - hh], [U(reach), yc5], [U(reach), yTop], [U(-singleBack), yTop]];
      shapes.push(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * MM, y * MM))));
      bolts.push([center, yc - boltPitch / 2], [center, yc + boltPitch / 2]);
      boltRoles.push('post', 'post');
    };
    // 大截面带外斜撑时，两侧各使用一块单面板。
    if (split) {
      addPlate(connection.xc + side * plateShift, side);
      addPlate(connection.xc - side * plateShift, -side);
    } else addPlate(xc, side);
    bolts.push([Q.x, Q.y]); boltRoles.push('inner');
    if (o && Qo) { bolts.push([Qo.x, Qo.y]); boltRoles.push('outer'); }
    const plateGeo = track(new THREE.ExtrudeGeometry(shapes, { depth: plate.thickness * MM, bevelEnabled: false }));
    const dimensions = plate.name.replaceAll('*', '×');
    const spec = dimensions + (split ? '（两块）' : '');
    const specLabel = (doublePlate ? '双面 ' : '单面 ') + dimensions + (split ? '（每柱两块）' : '');
    const extent = reach + (split ? Math.abs(plateShift) : 0);
    return { ...inner, B: Q, side, postSection, xc, yc, hh, yTop, plateT: plate.thickness, plateGeo, plateCount: shapes.length, bolts, boltRoles, o, spec, specLabel, split, extent };
  }
  function build(c: BuildContext, J: ReturnType<typeof braceJoint>, z0: number) {
    const { zw } = c;
    const plate = new THREE.Mesh(J.plateGeo, bracketMaterial);
    plate.position.z = (z0 + zw) * MM;
    plate.castShadow = plate.receiveShadow = true;
    c.hw.add(plate);
    // 连接板外侧放螺栓头，螺母及平垫/弹垫在杆件槽内。
    J.bolts.forEach(([x, y], i) => {
      const role = J.boltRoles[i];
      const thickness = role === 'post' ? J.postSection.t : section('brace', J.side < 0, role === 'outer').t;
      c.bolts.add(role === 'post' ? 'foot' : 'footBrace', V(x, y, z0 + zw - thickness), NZ, EY, thickness + J.plateT);
    });
  }
    this.braceJoint = braceJoint;
    this.build = build;
  }
}
