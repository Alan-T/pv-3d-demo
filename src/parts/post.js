import { addMember, NZ, EY, EX, V, MM } from '../core.js';

// One column position, repeated at the frame coordinates supplied to build().
export class PostPart {
  constructor({ section, material, buriedMaterial, x, bottom, top, ground, createSectionGeometry, track }) {
    this.geometry = track(createSectionGeometry(section));
    this.material = material;
    this.buriedMaterial = buriedMaterial;
    this.position = { x, bottom, top, ground };
  }

  build({ layout, zw, model, buried }) {
    const { x, bottom, top, ground } = this.position;
    const cut = Math.min(Math.max(ground, bottom), top);
    for (const z of layout.zs) {
      if (top - cut > 1) addMember(model, this.geometry, this.material, V(x, cut, z + zw), EX, NZ, EY.clone().multiplyScalar((top - cut) * MM));
      if (cut - bottom > 1) addMember(buried, this.geometry, this.buriedMaterial, V(x, bottom, z + zw), EX, NZ, EY.clone().multiplyScalar((cut - bottom) * MM));
    }
  }
}
