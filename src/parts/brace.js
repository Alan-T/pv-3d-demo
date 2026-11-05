import { addMember, NZ, V, V3, MM } from '../core.js';

// One inner/outer brace position. Connection plates are assembled separately.
export class BracePart {
  constructor({ section, material, node, createSectionGeometry, track }) {
    this.section = section;
    this.material = material;
    this.node = node;
    this.geometry = track(createSectionGeometry(section));
  }

  build({ layout, zw, u, model, bolts }) {
    const b = this.node;
    for (const z of layout.zs) {
      addMember(model, this.geometry, this.material, V(b.E.x, b.E.y, z + zw),
        new V3(-b.ay, b.ax, 0), NZ, new V3(b.ax, b.ay, 0).multiplyScalar(b.len * MM));
      bolts.add('btop', V(b.T.x, b.T.y, z + zw - this.section.t), NZ, u, this.section.t);
    }
  }
}
