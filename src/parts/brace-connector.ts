import type { PartOptions, BuildContext } from '../part-types.ts';
import type { ChannelSection } from '../design-types.ts';
import { braceMember, type braceConnection, type FramePoint } from '../brace-layout.ts';
import { BRACE_JOINT, getBraceConnectorPlate } from '../brace-connector-spec.ts';
import { FIX } from '../config.ts';
import { NZ, EY, V, MM } from '../core.ts';
import * as THREE from 'three';

/** 根据单块/双面板类型生成连接板二维轮廓。 */
function createPlateShape(
  center: number,
  direction: number,
  yc: number,
  hh: number,
  reach: number,
  doublePlate: boolean,
) {
  const { singleBack, singleBot, doubleBottomHalf, chamferY } = BRACE_JOINT;
  const u = (offset: number) => center + direction * offset;
  const yTop = yc + hh;
  const yc5 = yc + chamferY;
  const pts = doublePlate
    ? [
        [u(-reach), yTop],
        [u(reach), yTop],
        [u(reach), yc5],
        [u(doubleBottomHalf), yc - hh],
        [u(-doubleBottomHalf), yc - hh],
        [u(-reach), yc5],
      ]
    : [
        [u(-singleBack), yc - hh],
        [u(singleBot), yc - hh],
        [u(reach), yc5],
        [u(reach), yTop],
        [u(-singleBack), yTop],
      ];
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * MM, y * MM)));
}

/** 斜撑连接板：负责节点几何、孔位计算及立柱/斜撑连接螺栓生成。 */
export class BraceConnectorPart {
  private readonly material;
  private readonly plates;
  private readonly postFSection;
  private readonly postRSection;
  private readonly braceFSection;
  private readonly braceRSection;
  private readonly braceOFSection;
  private readonly braceORSection;
  private readonly track;

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
    this.material = bracketMaterial;
    this.plates = plates;
    this.postFSection = postFSection;
    this.postRSection = postRSection;
    this.braceFSection = braceFSection;
    this.braceRSection = braceRSection;
    this.braceOFSection = braceOFSection;
    this.braceORSection = braceORSection;
    this.track = track;
  }

  private getSection(kind: 'post' | 'brace', rear = false, outer = false): ChannelSection {
    if (kind === 'post') return rear ? this.postRSection : this.postFSection;
    if (outer) return rear ? this.braceORSection : this.braceOFSection;
    return rear ? this.braceRSection : this.braceFSection;
  }

  /** 孔位由求解层提供，模型、长度和标注共用坐标。 */
  braceJoint(connection: ReturnType<typeof braceConnection>, T: FramePoint, To?: FramePoint | null) {
    const { side, yc, Q, Qo, plateShift, split } = connection;
    const dbl = !!Qo;
    const postSection = this.getSection('post', side < 0);
    const xc = connection.xc + (dbl ? 0 : side * plateShift);
    const doublePlate = dbl && !split;
    const plate = getBraceConnectorPlate(dbl, split, this.plates);
    const hh = plate.height / 2;
    const yTop = yc + hh;
    const { singleBack, boltPitch } = BRACE_JOINT;
    const reach = doublePlate ? plate.width / 2 : plate.width - singleBack;
    const inner = braceMember(Q, T, FIX.braceEdge);
    const o = Qo && To ? braceMember(Qo, To, FIX.braceEdge) : null;

    const shapes: THREE.Shape[] = [];
    const bolts: [number, number][] = [];
    const boltRoles: string[] = [];
    const addPlate = (center: number, direction: number) => {
      shapes.push(createPlateShape(center, direction, yc, hh, reach, doublePlate));
      bolts.push([center, yc - boltPitch / 2], [center, yc + boltPitch / 2]);
      boltRoles.push('post', 'post');
    };

    // 大截面带外斜撑时，两侧各使用一块单面板。
    if (split) {
      addPlate(connection.xc + side * plateShift, side);
      addPlate(connection.xc - side * plateShift, -side);
    } else {
      addPlate(xc, side);
    }

    bolts.push([Q.x, Q.y]);
    boltRoles.push('inner');
    if (o && Qo) {
      bolts.push([Qo.x, Qo.y]);
      boltRoles.push('outer');
    }

    const plateGeo = this.track(new THREE.ExtrudeGeometry(shapes, { depth: plate.thickness * MM, bevelEnabled: false }));
    const dimensions = plate.name.replaceAll('*', '×');
    const spec = dimensions + (split ? '（两块）' : '');
    const specLabel = (doublePlate ? '双面 ' : '单面 ') + dimensions + (split ? '（每柱两块）' : '');
    const extent = reach + (split ? Math.abs(plateShift) : 0);

    return {
      ...inner,
      B: Q,
      side,
      postSection,
      xc,
      yc,
      hh,
      yTop,
      plateT: plate.thickness,
      plateGeo,
      plateCount: shapes.length,
      bolts,
      boltRoles,
      o,
      spec,
      specLabel,
      split,
      extent,
    };
  }

  build(c: BuildContext, J: ReturnType<BraceConnectorPart['braceJoint']>, z0: number) {
    const { zw } = c;
    const plate = new THREE.Mesh(J.plateGeo, this.material);
    plate.position.z = (z0 + zw) * MM;
    plate.castShadow = plate.receiveShadow = true;
    c.hw.add(plate);

    // 连接板外侧放螺栓头，螺母及平垫/弹垫在杆件槽内。
    J.bolts.forEach(([x, y], i) => {
      const role = J.boltRoles[i];
      const thickness = role === 'post' ? J.postSection.t : this.getSection('brace', J.side < 0, role === 'outer').t;
      c.bolts.add(role === 'post' ? 'foot' : 'footBrace', V(x, y, z0 + zw - thickness), NZ, EY, thickness + J.plateT);
    });
  }
}
