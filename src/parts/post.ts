import type { PartOptions, BuildContext } from '../part-types.ts';
import type { Material } from 'three';
import type { ChannelSection } from '../design-types.ts';
import { addMember, NZ, EY, EX, V, MM } from '../core.ts';

// One column position, repeated at the frame coordinates supplied to build().
export class PostPart {
  geometry;
  material;
  buriedMaterial;
  position;

  constructor({ section, material, buriedMaterial, x, bottom, top, ground, createSectionGeometry, track }: Pick<PartOptions['post'], 'buriedMaterial' | 'createSectionGeometry' | 'track'> & {
    section: ChannelSection; material: Material; x: number; bottom: number; top: number; ground: number;
  }) {
    this.geometry = track(createSectionGeometry(section));
    this.material = material;
    this.buriedMaterial = buriedMaterial;
    this.position = { x, bottom, top, ground };
  }

  build({ layout, zw, model, buried }: BuildContext) {
    const { x, bottom, top, ground } = this.position;
    const cut = Math.min(Math.max(ground, bottom), top);
    for (const z of layout.zs) {
      if (top - cut > 1) addMember(model, this.geometry, this.material, V(x, cut, z + zw), EX, NZ, EY.clone().multiplyScalar((top - cut) * MM));
      if (cut - bottom > 1) addMember(buried, this.geometry, this.buriedMaterial, V(x, bottom, z + zw), EX, NZ, EY.clone().multiplyScalar((cut - bottom) * MM));
    }
  }
}
