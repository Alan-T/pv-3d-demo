import type { PartOptions, BuildContext } from '../part-types.ts';
import { CylinderGeometry, Mesh, type Material } from 'three';
import type { ChannelSection } from '../design-types.ts';
import { FIX } from '../config.ts';
import { addMember, NZ, EY, EX, V, MM } from '../core.ts';

// One column position, repeated at the frame coordinates supplied to build().
export class PostPart {
  geometry;
  material;
  buriedMaterial;
  position;
  private readonly concretePile;

  constructor({ section, material, buriedMaterial, concreteMaterial, x, bottom, top, ground, pileGrade = ground, createSectionGeometry, track }: Pick<PartOptions['post'], 'buriedMaterial' | 'createSectionGeometry' | 'track'> & {
    section: ChannelSection; material: Material; concreteMaterial?: Material; x: number; bottom: number; top: number; ground: number; pileGrade?: number;
  }) {
    this.geometry = track(createSectionGeometry(section));
    this.material = material;
    this.buriedMaterial = buriedMaterial;
    this.position = { x, bottom, top, ground };
    if (concreteMaterial) {
      const { diameterAllowance, endAllowance } = FIX.concretePile;
      const diameter = Math.max(section.d, section.f) + diameterAllowance;
      const radius = diameter * MM / 2;
      const height = (pileGrade - bottom + 2 * endAllowance) * MM;
      this.concretePile = {
        geometry: track(new CylinderGeometry(radius, radius, height, 32)),
        material: concreteMaterial,
        centerY: (bottom + pileGrade) / 2,
        halfWidth: section.f / 2,
      };
    }
  }

  build({ layout, zw, model, buried }: BuildContext) {
    const { x, bottom, top, ground } = this.position;
    const cut = Math.min(Math.max(ground, bottom), top);
    for (const z of layout.zs) {
      if (top - cut > 1) addMember(model, this.geometry, this.material, V(x, cut, z + zw), EX, NZ, EY.clone().multiplyScalar((top - cut) * MM));
      if (cut - bottom > 1) addMember(buried, this.geometry, this.buriedMaterial, V(x, bottom, z + zw), EX, NZ, EY.clone().multiplyScalar((cut - bottom) * MM));
      if (this.concretePile) {
        const { geometry, material, centerY, halfWidth } = this.concretePile;
        const pile = new Mesh(geometry, material);
        pile.name = '水泥灌注桩';
        // C 型钢从腹板沿 -z 展宽，桩心对准钢柱截面中心。
        pile.position.copy(V(x, centerY, z + zw - halfWidth));
        buried.add(pile);
      }
    }
  }
}
