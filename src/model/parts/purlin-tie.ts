import type { PartOptions, PurlinTies, BoltCollector } from '../part-types.ts';
import type { BufferGeometry, Object3D, Vector3 } from 'three';
import type { Solution } from '../../domain/solve.ts';
import { addMember, V, EZ, MM } from '../geometry/core.ts';

export class PurlinTiePart {
  section;
  material;
  geometry;
  purlinSection;
  createDrilledGeometry;
  track;

  constructor({ section, purlinSection, material, createSectionGeometry, createDrilledAngleGeometry, createDrilledChannelWebGeometry, track }: PartOptions['purlinTie']) {
    this.section = section;
    this.material = material;
    this.geometry = track(this.alignGeometry(createSectionGeometry(section)));
    this.purlinSection = purlinSection;
    this.createDrilledGeometry = section.type === 'L'
      ? createDrilledAngleGeometry && ((length: number, holes: number[]) => createDrilledAngleGeometry(section, length, holes))
      : createDrilledChannelWebGeometry && ((length: number, holes: number[]) => createDrilledChannelWebGeometry(section, length, holes));
    this.track = track;
  }

  alignGeometry(geometry: BufferGeometry) {
    // 安装面统一位于局部 x=0。C 型绕杆轴转 90°，腹板贴檩条、槽口朝下。
    if ((this.section.type ?? 'C') === 'C') geometry.rotateZ(-Math.PI / 2);
    return geometry;
  }

  private geometryForTies(ties: PurlinTies, purlins: number[]) {
    if (!ties.count || !this.createDrilledGeometry) return this.geometry;
    const holes = purlins.map(position => position - ties.start);
    return this.track(this.alignGeometry(this.createDrilledGeometry(ties.length, holes)));
  }

  build({ solution, ties, parent, u, n, bolts }: {
    solution: Solution; ties: PurlinTies; parent: Object3D; u: Vector3; n: Vector3; bolts?: BoltCollector;
  }) {
    const start = solution.along(ties.start);
    const geometry = this.geometryForTies(ties, solution.purlins);
    const offset = this.section.type === 'L' ? this.section.f / 2 : 0;
    const mountingPoints = bolts && ties.rods.length ? solution.purlins.map(t => solution.along(t)) : [];
    for (const rod of ties.rods) {
      // L 型水平肢或 C 型腹板贴檩条底面；安装孔在跨中，C 型两翼位于孔的两侧。
      const origin = V(start.x, start.y, rod.z + offset).addScaledVector(n, solution.hBeamTop * MM);
      const mesh = addMember(parent, geometry, this.material, origin,
        n.clone().negate(), EZ.clone().negate(), u.clone().multiplyScalar(ties.length * MM));
      mesh.userData.purlinTie = { bay: rod.bay, length: ties.length };
      for (const { x, y } of mountingPoints) {
        // 螺母侧夹紧面位于拉杆安装面下面，头部在檩条槽内。
        const nutFace = V(x, y, rod.z).addScaledVector(n, (solution.hBeamTop - this.section.t) * MM);
        bolts?.add('purlinTie', nutFace, n.clone().negate(), u, this.purlinSection.t + this.section.t);
      }
    }
  }
}
