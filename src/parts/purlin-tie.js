import { addMember, V, EZ, MM } from '../core.js';

export class PurlinTiePart {
  constructor({ section, purlinSection, material, createSectionGeometry, createDrilledAngleGeometry, track }) {
    this.section = section;
    this.material = material;
    this.geometry = track(createSectionGeometry(section));
    this.purlinSection = purlinSection;
    this.createDrilledGeometry = createDrilledAngleGeometry;
    this.track = track;
  }

  build({ solution, ties, parent, u, n, bolts }) {
    const p = solution.along(ties.start);
    const geometry = ties.count && this.createDrilledGeometry
      ? this.track(this.createDrilledGeometry(this.section,ties.length,solution.purlins.map(t=>t-ties.start))) : this.geometry;
    for (const rod of ties.rods) {
      // 水平肢贴檩条下翼缘底面，竖肢向下；东西向居中于跨中。
      const origin = V(p.x, p.y, rod.z + this.section.f / 2)
        .addScaledVector(n, solution.hBeamTop * MM);
      const mesh = addMember(parent, geometry, this.material, origin,
        n.clone().negate(), EZ.clone().negate(), u.clone().multiplyScalar(ties.length * MM));
      mesh.userData.purlinTie = { bay: rod.bay, length: ties.length };
      for (const t of solution.purlins) {
        const point=solution.along(t);
        // 头在檩条槽内；螺母在角钢水平肢下面，原点为螺母侧夹紧面。
        bolts?.add('purlinTie',V(point.x,point.y,rod.z).addScaledVector(n,(solution.hBeamTop-this.section.t)*MM),
          n.clone().negate(),u,this.purlinSection.t+this.section.t);
      }
    }
  }
}
