import type { PartOptions, ClipSpec } from '../part-types.ts';
import { BRACE_JOINT } from '../brace-connector-spec.ts';
import { CLAMP_PROFILE, getClampBoltSpec } from '../clamp-spec.ts';
import { V3, MM, instanced } from '../core.ts';
import { createSerratedWasherGeometry } from '../serrated-washer-geometry.ts';
import * as THREE from 'three';

const BOLT_SIZE = {
  16: { wr: 15, wt: 3, af: 24, nh: 14.8, r: 8, hh: 10, out: 6, sw: { ri: 8.1, ro: 12.2, t: 4 } },
  12: { wr: 12, wt: 2.5, af: 18, nh: 10.8, r: 6, hh: 7.5, out: 6, sw: { ri: 6.1, ro: 9.2, t: 3.1 } },
  8: { wr: 8, wt: 1.6, af: 13, nh: 6.5, r: 4, hh: 5.3, out: 4, sw: { ri: 4.1, ro: 6.35, t: 2 }, sk: { d: 13, k: 8, s: 6 } },
} as const;

type BoltSizeKey = keyof typeof BOLT_SIZE;
type BoltPartPair = [THREE.BufferGeometry, THREE.Material];
interface BoltBatch {
  kind: string;
  parts: BoltPartPair[];
  matrices: THREE.Matrix4[];
}
type BoltKindOptions = {
  len?: number;
  headWasher?: boolean;
  socket?: boolean;
  spring?: boolean;
  serratedHeadWasher?: boolean;
  nutWasher?: { radius: number; thickness: number };
};
type SlotOptions = { at: number[]; len: number; width?: number } | null;

// 组件螺栓、压块螺栓跟着檩条顺坡（东西坡度），其余在各榀上。
const SLOPE_KINDS = new Set(['splice', 'module', 'clampMid', 'clampSide']);
const ROUND_HOLE_KINDS = new Set(['btop', 'postTie', 'purlinTie', 'splice']);
const HEAD_WASHER_KINDS = new Set(['foot', 'footBrace', 'top', 'btop', 'postTie', 'purlinTie', 'splice']);
const M8_KINDS = new Set(['module', 'clampMid', 'clampSide']);

function countBoltSets(batches: Record<string, BoltBatch>) {
  const counts = {
    m16: 0, m12: 0, spliceBolts: 0, purlinTieBolts: 0,
    m8: batches.module.matrices.length,
    m8c: batches.clampMid.matrices.length + batches.clampSide.matrices.length,
  };
  for (const { kind, matrices } of Object.values(batches)) {
    const count = matrices.length;
    if (kind === 'top') counts.m16 += count;
    else if (!M8_KINDS.has(kind)) counts.m12 += count;
    if (kind === 'splice') counts.spliceBolts += count;
    if (kind === 'purlinTie') counts.purlinTieBolts += count;
  }
  return counts;
}

/** 弹垫：开口的圆环，开口在局部 x-y 平面的左上方（节点正视图里看得见），从 z0 起厚 sw.t。 */
function createSpringWasherGeometry(sw: { ri: number; ro: number; t: number }, z0: number) {
  const gap = 0.12;
  const a0 = (3 * Math.PI) / 4 + gap;
  const a1 = a0 + 2 * Math.PI - 2 * gap;
  const s = new THREE.Shape();
  s.absarc(0, 0, sw.ro * MM, a0, a1, false);
  s.absarc(0, 0, sw.ri * MM, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: sw.t * MM, bevelEnabled: false, curveSegments: 32 });
  return g.translate(0, 0, z0 * MM);
}

/** 内六角头的前半段：六角孔对边为 s，负 z 端为螺栓头顶面，外沿倒角 0.6 mm。 */
function createSocketRimGeometry(diameter: number, s: number, depth: number, z0: number) {
  const radius = (diameter * MM) / 2;
  const hexRadius = (s * MM) / Math.sqrt(3);
  const outline = new THREE.Shape();
  const recess = new THREE.Path();
  outline.absarc(0, 0, radius, 0, 2 * Math.PI, false);
  for (let i = 0; i < 6; i++) {
    const angle = (-i * Math.PI) / 3;
    const x = hexRadius * Math.cos(angle);
    const y = hexRadius * Math.sin(angle);
    if (i === 0) recess.moveTo(x, y);
    else recess.lineTo(x, y);
  }
  recess.closePath();
  outline.holes.push(recess);

  const rim = new THREE.ExtrudeGeometry(outline, { depth: depth * MM, steps: 2, curveSegments: 12, bevelEnabled: false });
  const vertices = rim.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const y = vertices.getY(i);
    const z = vertices.getZ(i);
    if (z === 0 && Math.hypot(x, y) > hexRadius + 1e-8) {
      const scale = (radius - 0.6 * MM) / radius;
      vertices.setXY(i, x * scale, y * scale);
    } else if (Math.abs(z - (depth * MM) / 2) < 1e-8) {
      vertices.setZ(i, 0.6 * MM);
    }
  }
  rim.computeVertexNormals();
  return rim.translate(0, 0, z0 * MM);
}

/** 生成沿局部 z 的圆柱/棱柱几何体（r1 为 z1 端半径，不传则为等径柱）。 */
function createCylinderGeometry(r: number, z0: number, z1: number, seg: number, r1?: number) {
  const g = new THREE.CylinderGeometry((r1 === undefined ? r : r1) * MM, r * MM, (z1 - z0) * MM, seg);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, ((z0 + z1) / 2) * MM);
  return g;
}

/** 生成长圆孔二维形状。 */
function createSlotShape(len: number, width: number) {
  const w = (width / 2) * MM;
  const l = ((len - width) / 2) * MM;
  const s = new THREE.Shape();
  s.moveTo(w, -l);
  s.lineTo(w, l);
  s.absarc(0, l, w, 0, Math.PI, false);
  s.lineTo(-w, -l);
  s.absarc(0, -l, w, Math.PI, Math.PI * 2, false);
  return s;
}

/**
 * 螺栓组构建器：M16 / M12 / M8 三种规格，按连接位置分叠层厚度。
 * 局部 z 为螺栓轴线并指向螺母一侧，z=0 在螺母侧被连接件外表面。
 * 每次重建通过 collector() 登记螺栓位置，flush() 统一实例化绘制并统计套数。
 */
export class BoltsPart {
  private readonly beamSection;
  private readonly purlinSection;
  private readonly materials;
  private readonly track;
  private readonly standardKinds: Record<string, BoltPartPair[]>;
  private readonly clampKinds: Record<number, Record<string, BoltPartPair[]>> = {};
  private serratedModule: BoltPartPair[] | undefined;

  constructor({
    beamSection,
    purlinSection,
    boltSteelMaterial,
    nutMaterial = boltSteelMaterial,
    washerMaterial = boltSteelMaterial,
    springMaterial = boltSteelMaterial,
    slotMaterial,
    CLIP,
    track,
  }: PartOptions['bolts'] & { CLIP: ClipSpec }) {
    this.beamSection = beamSection;
    this.purlinSection = purlinSection;
    this.materials = {
      steel: boltSteelMaterial,
      nut: nutMaterial,
      washer: washerMaterial,
      spring: springMaterial,
      slot: slotMaterial,
    };
    this.track = track;

    // 立柱、内外斜撑连接螺栓由 add() 按各构件实际板厚动态生成。
    const m12 = { len: 35, headWasher: true, spring: true };
    this.standardKinds = {
      clip: this.boltKind(12, CLIP.t + beamSection.t, null, m12),
      clipWeb: this.boltKind(12, CLIP.t + purlinSection.t, null, m12),
      purlinBeam: this.boltKind(12, purlinSection.t + beamSection.t, null, m12),
      splice: this.boltKind(12, purlinSection.t + 3, null, m12),
      module: this.moduleBolt(false),
    };
  }

  private boltKind(size: BoltSizeKey, stack: number, slot: SlotOptions, opt: BoltKindOptions): BoltPartPair[] {
    const b = BOLT_SIZE[size];
    const hexR = b.af / Math.sqrt(3);
    const washer = opt.nutWasher || { radius: b.wr, thickness: b.wt };
    const nut = washer.thickness + (opt.spring ? b.sw.t : 0);
    const top = nut + b.nh;
    const serratedThickness = 0.6;
    const headWasherHeight = opt.serratedHeadWasher ? 3 * serratedThickness : b.wt;
    const back = -stack - (opt.headWasher ? headWasherHeight : 0);
    const socket = opt.socket ? BOLT_SIZE[8].sk : null;
    const hh = socket ? socket.k : b.hh;
    const recessDepth = 4;
    const cyl = (r: number, z0: number, z1: number, seg: number, r1?: number) =>
      this.track(createCylinderGeometry(r, z0, z1, seg, r1));

    const parts: BoltPartPair[] = [
      [cyl(washer.radius, 0, washer.thickness, 24), this.materials.washer],
      [cyl(hexR, nut, top, 6), this.materials.nut],
      [cyl(b.r, socket ? back : back - hh, opt.len ? back + opt.len : top + b.out, 16), this.materials.steel],
      socket
        ? [cyl(socket.d / 2, back - hh + recessDepth, back, 24), this.materials.steel]
        : [cyl(hexR, back - hh, back, 6), this.materials.steel],
    ];

    if (opt.headWasher) {
      let geometry: THREE.BufferGeometry;
      if (opt.serratedHeadWasher) {
        geometry = this.track(
          createSerratedWasherGeometry({ outerRadius: b.wr, innerRadius: b.r + 0.4, thickness: serratedThickness }),
        );
        geometry.translate(0, 0, back * MM);
      } else {
        geometry = cyl(b.wr, back, -stack, 24);
      }
      parts.push([geometry, this.materials.washer]);
    }

    if (opt.spring) {
      parts.push([this.track(createSpringWasherGeometry(b.sw, washer.thickness)), this.materials.spring]);
    }

    if (socket) {
      parts.push([this.track(createSocketRimGeometry(socket.d, socket.s, recessDepth, back - hh)), this.materials.steel]);
    }

    if (slot) {
      const shape = createSlotShape(slot.len, slot.width ?? BRACE_JOINT.slotW);
      for (const z of slot.at) {
        const g = this.track(new THREE.ShapeGeometry(shape, 12));
        g.translate(0, 0, z * MM);
        parts.unshift([g, this.materials.slot]);
      }
    }

    return parts;
  }

  private moduleBolt(serratedHeadWasher: boolean) {
    return this.boltKind(8, this.purlinSection.t + 2, null, {
      len: 22, headWasher: true, serratedHeadWasher, spring: true,
      nutWasher: { radius: 12, thickness: 2 },
    });
  }

  /** 上节点的夹紧厚度包含斜梁腹板，其余节点直接使用传入的叠层厚度。 */
  private connectionBolt(kind: string, thickness: number) {
    const postTop = kind === 'top';
    const stack = postTop || kind === 'btop' ? thickness + this.beamSection.t : thickness;
    let slot: SlotOptions = null;
    if (postTop) {
      slot = { at: [-this.beamSection.t, -stack - 0.4], len: 40, width: 18 };
    } else if (!ROUND_HOLE_KINDS.has(kind)) {
      slot = { at: [-stack - 0.4], len: BRACE_JOINT.slotL, width: BRACE_JOINT.slotW };
    }
    return this.boltKind(postTop ? 16 : 12, stack, slot, {
      len: postTop ? 40 : 35, headWasher: HEAD_WASHER_KINDS.has(kind), spring: true,
    });
  }

  /** 按组件厚度缓存压块 M8 内六角螺栓几何体。 */
  private getKinds(modT: number): Record<string, BoltPartPair[]> {
    if (!this.clampKinds[modT]) {
      const { length } = getClampBoltSpec(modT);
      const options: BoltKindOptions = {
        len: length,
        socket: true,
        headWasher: true,
        spring: true,
        nutWasher: { radius: 12, thickness: 2 },
      };
      this.clampKinds[modT] = {
        clampMid: this.boltKind(8, this.purlinSection.t + modT - CLAMP_PROFILE.mid.floor, null, options),
        clampSide: this.boltKind(8, this.purlinSection.t + modT - CLAMP_PROFILE.side.floor, null, options),
      };
    }
    return { ...this.standardKinds, ...this.clampKinds[modT] };
  }

  /** 创建单次重建的螺栓收集器：add() 登记一颗螺栓，flush() 实例化绘制并统计套数。 */
  collector(modT: number, { moduleSerratedWasher = false } = {}) {
    const kinds = this.getKinds(modT);
    if (moduleSerratedWasher) {
      this.serratedModule ??= this.moduleBolt(true);
      kinds.module = this.serratedModule;
    }
    const batches: Record<string, BoltBatch> = {};
    for (const [kind, parts] of Object.entries(kinds)) {
      batches[kind] = { kind, parts, matrices: [] };
    }

    return {
      /** axis：螺栓轴线（指向螺母一侧），up：局部 y（长圆孔方向）。 */
      add: (kind: string, p: THREE.Vector3, axis: THREE.Vector3, up: THREE.Vector3, thickness?: number) => {
        const key = thickness === undefined ? kind : `${kind}:${thickness}`;
        if (thickness !== undefined && !batches[key]) {
          batches[key] = { kind, parts: this.connectionBolt(kind, thickness), matrices: [] };
        }
        const z = axis.clone().normalize();
        const y = up.clone().normalize();
        const x = new V3().crossVectors(y, z);
        batches[key].matrices.push(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p));
      },

      flush(parent: THREE.Object3D, slopeParent: THREE.Object3D, purlinTieParent = slopeParent) {
        for (const { kind, parts, matrices } of Object.values(batches)) {
          let target = parent;
          if (kind === 'purlinTie') target = purlinTieParent;
          else if (SLOPE_KINDS.has(kind)) target = slopeParent;
          for (const [geometry, material] of parts) instanced(target, geometry, material, matrices);
        }
        return countBoltSets(batches);
      },
    };
  }
}
