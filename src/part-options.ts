import type { BufferGeometry, Material } from 'three';
import { FIX } from './config.ts';
import type { MemberSections } from './design-types.ts';
import type { braceConnectorPlates } from './brace-connector-spec.ts';
import type { createSectionGeometry, createSectionCapGeometry } from './section-geometry.ts';
import { createDrilledAngleGeometry, createDrilledPurlinGeometry, createDrilledChannelWebGeometry } from './drilled-section-geometry.ts';

/** Page-independent translation from section/material configuration to part options. */
interface PartDependencies {
  sections: MemberSections;
  materials: Record<'purlinTie' | 'postTie' | 'post' | 'buried' | 'concrete' | 'beam' | 'brace' | 'bracket' | 'purlin' | 'purlinCap' | 'purlinConnector' | 'clip' | 'moduleCap' | 'clamp' | 'boltSteel' | 'boltNut' | 'boltWasher' | 'boltSpring' | 'slot', Material>;
  connections: { plates: typeof braceConnectorPlates };
  geometry: {
    createSectionGeometry: typeof createSectionGeometry;
    createSectionCapGeometry: typeof createSectionCapGeometry;
    modMats: Material[];
  };
  track: <T extends BufferGeometry>(geometry: T) => T;
}

export function createPartOptions({ sections, materials, connections, geometry, track }: PartDependencies) {
  const { plates } = connections;
  const { createSectionGeometry, createSectionCapGeometry, modMats } = geometry;
  return {
    purlinTie: { section: sections.purlinTie, purlinSection: sections.purlin, material: materials.purlinTie, createSectionGeometry, createDrilledAngleGeometry, createDrilledChannelWebGeometry, track },
    postTie: { section: sections.postTie, material: materials.postTie, createSectionGeometry, track },
    post: { postFSection: sections.postF,
      postRSection: sections.postR,
      postMaterial: materials.post,
      buriedMaterial: materials.buried,
      concreteMaterial: materials.concrete,
      createSectionGeometry,
      track },
    beam: { beamSection: sections.beam,
      postFSection: sections.postF,
      postRSection: sections.postR,
      beamMaterial: materials.beam,
      createSectionGeometry,
      track },
    brace: { braceMaterial: materials.brace,
      createSectionGeometry,
      postFSection: sections.postF,
      postRSection: sections.postR,
      braceFSection: sections.braceF,
      braceRSection: sections.braceR,
      braceOFSection: sections.braceOF,
      braceORSection: sections.braceOR,
      braceConnector: { bracketMaterial: materials.bracket,
      plates,
      postFSection: sections.postF,
      postRSection: sections.postR,
      braceFSection: sections.braceF,
      braceRSection: sections.braceR,
      braceOFSection: sections.braceOF,
      braceORSection: sections.braceOR,
      track },
      track },
    purlin: { purlinSection: sections.purlin,
      createDrilledPurlinGeometry,
      purlinMaterial: materials.purlin,
      purlinCapMaterial: materials.purlinCap,
      createSectionGeometry,
      createSectionCapGeometry,
      purlinConnector: { purlinSection: sections.purlin,

      purlinConnectorMaterial: materials.purlinConnector,
      track },
      purlinClip: { beamSection: sections.beam,
      purlinSection: sections.purlin,
      clipMaterial: materials.clip,
      track },
      track },
    module: { purlinSection: sections.purlin,
      moduleCapMaterial: materials.moduleCap,
      modMats,
      track },
    clamp: { modGapEWSection: FIX.modGapEW,
      purlinSection: sections.purlin,
      clampMaterial: materials.clamp,
      track },
    bolts: {
      beamSection: sections.beam,
      purlinSection: sections.purlin,
      boltSteelMaterial: materials.boltSteel,
      nutMaterial: materials.boltNut,
      washerMaterial: materials.boltWasher,
      springMaterial: materials.boltSpring,
      slotMaterial: materials.slot,
      track },
  };
}
