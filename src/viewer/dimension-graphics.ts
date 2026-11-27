import type { RuntimeContext } from './runtime-context.ts';
import * as THREE from 'three';
import { FONT } from '../model/geometry/core.ts';

// 图纸尺寸与连接节点共用线材质、屏幕文字和以米为单位的标注几何。
const lineOptions = { depthTest: false, transparent: true };
export function createDimensionGraphics(context: RuntimeContext) {
  const { track } = context;

  const dimensionMaterials = {
    line: new THREE.LineBasicMaterial({ ...lineOptions, color: 0x2f9e44 }),
    reference: new THREE.LineBasicMaterial({ ...lineOptions, color: 0x7d8790 }),
    ground: new THREE.LineBasicMaterial({ ...lineOptions, color: 0x8a6a35 }),
    center: new THREE.LineDashedMaterial({ ...lineOptions, color: 0xd23b3b, dashSize: 0.016, gapSize: 0.006 }),
    purlin: new THREE.LineBasicMaterial({ ...lineOptions, color: 0x1f5c34 }),
    beam: new THREE.LineBasicMaterial({ ...lineOptions, color: 0xd8861a }),
    dashed: new THREE.LineDashedMaterial({ ...lineOptions, color: 0x7d8790, dashSize: 0.08, gapSize: 0.06 }),
  };
  const KIND = { in: '#1958d0', out: '#1f1f1f', ref: '#5f6873' };

  type LabelKind = keyof typeof KIND;

  function makeLabel(text: string | number, kind: LabelKind, px?: number) {
    const fs = 40;
    const padX = 12;
    const padY = 6;
    const cv = document.createElement('canvas');
    const g = cv.getContext('2d')!;
    g.font = `600 ${fs}px ${FONT}`;
    const w = Math.ceil(g.measureText(String(text)).width) + padX * 2;
    const h = fs + padY * 2;
    cv.width = w;
    cv.height = h;
    g.font = `600 ${fs}px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.86)';
    const r = 10;
    g.beginPath();
    g.moveTo(r, 0);
    g.arcTo(w, 0, w, h, r);
    g.arcTo(w, h, 0, h, r);
    g.arcTo(0, h, 0, 0, r);
    g.arcTo(0, 0, w, 0, r);
    g.fill();
    g.fillStyle = KIND[kind] || KIND.out;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(text), w / 2, h / 2 + 2);

    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
    track(tex, mat);
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 1001;
    sp.userData = { aspect: w / h, px: px || 15 };
    context.labels.push(sp);
    return sp;
  }

  class DimSet {
    group = new THREE.Group();
    pos: number[] = [];
    dash: number[] = [];

    seg(a: THREE.Vector3, b: THREE.Vector3, dashed = false) {
      (dashed ? this.dash : this.pos).push(a.x, a.y, a.z, b.x, b.y, b.z);
    }

    label(text: string | number, at: THREE.Vector3, kind: LabelKind, px?: number) {
      const sprite = makeLabel(text, kind, px);
      sprite.position.copy(at);
      this.group.add(sprite);
      return sprite;
    }

    /** a、b 为被测点，off 为尺寸线相对被测点的偏移（米）；k 为界线留空、出头和斜短线的比例。 */
    dim(a: THREE.Vector3, b: THREE.Vector3, off: THREE.Vector3, text: string | number, kind: LabelKind, px?: number, k = 1) {
      const on = off.clone().normalize();
      const A = a.clone().add(off);
      const B = b.clone().add(off);
      this.seg(a.clone().addScaledVector(on, 0.03 * k), A.clone().addScaledVector(on, 0.05 * k));
      this.seg(b.clone().addScaledVector(on, 0.03 * k), B.clone().addScaledVector(on, 0.05 * k));
      this.seg(A, B);
      const tick = B.clone().sub(A).normalize().add(on).normalize().multiplyScalar(0.045 * k);
      this.seg(A.clone().sub(tick), A.clone().add(tick));
      this.seg(B.clone().sub(tick), B.clone().add(tick));
      const label = this.label(text, A.clone().add(B).multiplyScalar(0.5), kind, px);
      return { label, A, B };
    }

    finish(lineMat: THREE.LineBasicMaterial, dashLineMat?: THREE.LineBasicMaterial) {
      const batches = [[this.pos, lineMat], [this.dash, dashLineMat ?? dimensionMaterials.dashed]] as const;
      for (const [positions, material] of batches) {
        if (!positions.length) continue;
        const geometry = track(new THREE.BufferGeometry());
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const segments = new THREE.LineSegments(geometry, material);
        if (material instanceof THREE.LineDashedMaterial) segments.computeLineDistances();
        segments.renderOrder = 1000;
        this.group.add(segments);
      }
      return this.group;
    }
  }

  function disposeDimensions() {
    for (const material of Object.values(dimensionMaterials)) material.dispose();
  }

  return { DimSet, dimensionMaterials, disposeDimensions };
}

export type DimensionGraphics = ReturnType<typeof createDimensionGraphics>;

export type DimensionSet = InstanceType<DimensionGraphics['DimSet']>;
