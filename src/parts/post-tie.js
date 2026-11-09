import { addMember, V, V3, MM } from '../core.js';

// 一排立柱的跨间拉杆。安装点已是世界坐标，不能再做榀位抬高或顺坡剪切。
export class PostTiePart {
  constructor({ section, postSection, material, createSectionGeometry, track }) {
    this.section = section;
    this.postSection = postSection;
    this.material = material;
    this.geometry = track(createSectionGeometry(section));
  }

  build({ row, parent, bolts }) {
    for (const rod of row.rods) {
      // X 的两根分别贴在立柱两侧翼缘外侧，避免交叉处实体穿插。
      const side = rod.direction;
      const x = row.x + side * this.postSection.d / 2;
      const a = V(x, rod.start.y, rod.start.z), b = V(x, rod.end.y, rod.end.z);
      const axis = b.clone().sub(a).normalize();
      const width = new V3(side, 0, 0);
      const height = width.clone().cross(axis);
      // 螺栓头在拉杆槽内，穿过拉杆腹板及柱翼缘；螺母在立柱槽内。
      // 收集器原点为螺母侧夹紧面，轴线朝立柱内侧。
      for (const point of [a, b]) {
        bolts?.add('postTie', point.clone().addScaledVector(width, -this.postSection.t * MM),
          width.clone().negate(), axis, this.section.t + this.postSection.t);
      }
      const endAllowance = (rod.length * MM - a.distanceTo(b)) / 2;
      const mesh = addMember(parent, this.geometry, this.material,
        a.clone().addScaledVector(axis, -endAllowance), height, width, axis.multiplyScalar(rod.length * MM));
      mesh.userData.postTie = { rear: row.rear, bay: rod.bay, length: rod.length };
    }
  }
}
