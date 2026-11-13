import { addMember, V, EZ, MM } from '../core.js';

export class PurlinTiePart {
  constructor({ section, purlinSection, material, createSectionGeometry, createDrilledAngleGeometry, createDrilledChannelWebGeometry, track }) {
    this.section = section;
    this.material = material;
    this.geometry = track(this.alignGeometry(createSectionGeometry(section)));
    this.purlinSection = purlinSection;
    this.createDrilledGeometry = section.type === 'L' ? createDrilledAngleGeometry : createDrilledChannelWebGeometry;
    this.track = track;
  }

  alignGeometry(geometry) {
    // 安装面统一位于局部 x=0。C 型绕杆轴转 90°，腹板贴檩条、槽口朝下。
    if ((this.section.type ?? 'C') === 'C') geometry.rotateZ(-Math.PI / 2);
    return geometry;
  }

  build({ solution, ties, parent, u, n, bolts }) {
    const p = solution.along(ties.start);
    const geometry = ties.count && this.createDrilledGeometry
      ? this.track(this.alignGeometry(this.createDrilledGeometry(this.section,ties.length,solution.purlins.map(t=>t-ties.start)))) : this.geometry;
    for (const rod of ties.rods) {
      // L 型水平肢或 C 型腹板贴檩条底面；安装孔在跨中，C 型两翼位于孔的两侧。
      const offset = this.section.type === 'L' ? this.section.f / 2 : 0;
      const origin = V(p.x, p.y, rod.z + offset)
        .addScaledVector(n, solution.hBeamTop * MM);
      const mesh = addMember(parent, geometry, this.material, origin,
        n.clone().negate(), EZ.clone().negate(), u.clone().multiplyScalar(ties.length * MM));
      mesh.userData.purlinTie = { bay: rod.bay, length: ties.length };
      for (const t of solution.purlins) {
        const point=solution.along(t);
        // 头在檩条槽内；螺母在拉杆安装面下面，原点为螺母侧夹紧面。
        bolts?.add('purlinTie',V(point.x,point.y,rod.z).addScaledVector(n,(solution.hBeamTop-this.section.t)*MM),
          n.clone().negate(),u,this.purlinSection.t+this.section.t);
      }
    }
  }
}
