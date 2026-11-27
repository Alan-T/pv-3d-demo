import type { PartOptions, ClipSpec } from '../part-types.ts';
import { MODULE_MOUNTING } from '../../config/engineering-rules.ts';
import {
  BOLT_DIMENSIONS, CLAMP_FASTENER, JOINT_FASTENER_RULES, M8_SOCKET_HEAD, SERRATED_WASHER,
  type FastenerSpec, type JointFastenerKind,
} from '../../domain/specs/fastener-spec.ts';
import { CLAMP_PROFILE, getClampBoltSpec } from '../../domain/specs/clamp-spec.ts';
import { V3, MM, instanced } from '../geometry/core.ts';
import { createSerratedWasherGeometry } from '../geometry/serrated-washer-geometry.ts';
import * as THREE from 'three';

type ClampKind = 'clampMid' | 'clampSide';
type BoltKind = JointFastenerKind | ClampKind;
type BoltPartPair = [THREE.BufferGeometry, THREE.Material];
interface BoltBatch {
  kind: BoltKind;
  parts: BoltPartPair[];
  matrices: THREE.Matrix4[];
}
type SlotOptions = { at: number[]; length: number; width: number };

function isClamp(kind: BoltKind): kind is ClampKind {
  return kind === 'clampMid' || kind === 'clampSide';
}

function countBoltSets(batches: Record<string, BoltBatch>) {
  const counts = { m16: 0, m12: 0, spliceBolts: 0, purlinTieBolts: 0, m8: 0, m8c: 0 };
  for (const { kind, matrices } of Object.values(batches)) {
    const count = matrices.length;
    if (isClamp(kind)) counts.m8c += count;
    else counts[`m${JOINT_FASTENER_RULES[kind].diameter}`] += count;
    if (kind === 'splice') counts.spliceBolts += count;
    if (kind === 'purlinTie') counts.purlinTieBolts += count;
  }
  return counts;
}

/** 弹垫：开口在局部 x-y 平面的左上方，轴向起点 z0 和截面尺寸均为 mm。 */
function createSpringWasherGeometry(sw: { innerRadius: number; outerRadius: number; thickness: number }, z0: number) {
  const gap = 0.12;
  const a0 = (3 * Math.PI) / 4 + gap;
  const a1 = a0 + 2 * Math.PI - 2 * gap;
  const s = new THREE.Shape();
  s.absarc(0, 0, sw.outerRadius * MM, a0, a1, false);
  s.absarc(0, 0, sw.innerRadius * MM, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: sw.thickness * MM, bevelEnabled: false, curveSegments: 32 });
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
      const scale = (radius - M8_SOCKET_HEAD.chamfer * MM) / radius;
      vertices.setXY(i, x * scale, y * scale);
    } else if (Math.abs(z - (depth * MM) / 2) < 1e-8) {
      vertices.setZ(i, M8_SOCKET_HEAD.chamfer * MM);
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
  private readonly standardKinds;
  private readonly clampKinds: Record<number, Record<ClampKind, BoltPartPair[]>> = {};
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
    this.standardKinds = {
      clip: this.connectionBolt('clip', CLIP.t + beamSection.t),
      clipWeb: this.connectionBolt('clipWeb', CLIP.t + purlinSection.t),
      purlinBeam: this.connectionBolt('purlinBeam', purlinSection.t + beamSection.t),
      // 独立调用未给叠厚时按 3 mm 连接件；组装路径传入实际连接件及翼缘间隙。
      splice: this.connectionBolt('splice', purlinSection.t + 3),
      module: this.moduleBolt(false),
    };
  }

  private boltGeometry(
    spec: FastenerSpec, stack: number,
    { slot, socket, serratedHeadWasher }: { slot?: SlotOptions; socket?: boolean; serratedHeadWasher?: boolean } = {},
  ): BoltPartPair[] {
    const b = BOLT_DIMENSIONS[spec.diameter];
    const hexR = b.acrossFlats / Math.sqrt(3);
    const shankRadius = spec.diameter / 2;
    const washer = spec.nutWasher ?? { radius: b.washerRadius, thickness: b.washerThickness };
    const nut = washer.thickness + (spec.spring ? b.spring.thickness : 0);
    const top = nut + b.nutHeight;
    const headWasherHeight = serratedHeadWasher ? 3 * SERRATED_WASHER.thickness : b.washerThickness;
    const back = -stack - (spec.headWasher ? headWasherHeight : 0);
    const headHeight = socket ? M8_SOCKET_HEAD.height : b.headHeight;
    const cyl = (r: number, z0: number, z1: number, seg: number, r1?: number) =>
      this.track(createCylinderGeometry(r, z0, z1, seg, r1));

    const parts: BoltPartPair[] = [
      [cyl(washer.radius, 0, washer.thickness, 24), this.materials.washer],
      [cyl(hexR, nut, top, 6), this.materials.nut],
      [cyl(shankRadius, socket ? back : back - headHeight, back + spec.length, 16), this.materials.steel],
      socket
        ? [cyl(M8_SOCKET_HEAD.diameter / 2, back - headHeight + M8_SOCKET_HEAD.recessDepth, back, 24), this.materials.steel]
        : [cyl(hexR, back - headHeight, back, 6), this.materials.steel],
    ];

    if (spec.headWasher) {
      let geometry: THREE.BufferGeometry;
      if (serratedHeadWasher) {
        geometry = this.track(
          createSerratedWasherGeometry({
            outerRadius: b.washerRadius, innerRadius: shankRadius + SERRATED_WASHER.radialClearance, thickness: SERRATED_WASHER.thickness,
          }),
        );
        geometry.translate(0, 0, back * MM);
      } else {
        geometry = cyl(b.washerRadius, back, -stack, 24);
      }
      parts.push([geometry, this.materials.washer]);
    }

    if (spec.spring) {
      parts.push([this.track(createSpringWasherGeometry(b.spring, washer.thickness)), this.materials.spring]);
    }

    if (socket) {
      const { diameter, acrossFlats, recessDepth } = M8_SOCKET_HEAD;
      parts.push([this.track(createSocketRimGeometry(diameter, acrossFlats, recessDepth, back - headHeight)), this.materials.steel]);
    }

    if (slot) {
      const shape = createSlotShape(slot.length, slot.width);
      for (const z of slot.at) {
        const g = this.track(new THREE.ShapeGeometry(shape, 12));
        g.translate(0, 0, z * MM);
        parts.unshift([g, this.materials.slot]);
      }
    }

    return parts;
  }

  private moduleBolt(serratedHeadWasher: boolean) {
    return this.boltGeometry(JOINT_FASTENER_RULES.module, this.purlinSection.t + MODULE_MOUNTING.frameFlangeThickness, { serratedHeadWasher });
  }

  /** 上节点的夹紧厚度包含斜梁腹板，其余节点直接使用传入的叠层厚度。 */
  private connectionBolt(kind: JointFastenerKind, thickness: number) {
    const rule = JOINT_FASTENER_RULES[kind];
    const stack = rule.includeBeamWeb ? thickness + this.beamSection.t : thickness;
    if (!rule.slot) return this.boltGeometry(rule, stack);
    // 孔面离开夹紧面 0.4 mm，避免与板面深度冲突。
    const slotFace = -stack - 0.4;
    const at = rule.slot.doubleSided ? [-this.beamSection.t, slotFace] : [slotFace];
    return this.boltGeometry(rule, stack, { slot: { ...rule.slot, at } });
  }

  /** 按组件厚度缓存压块 M8 内六角螺栓几何体。 */
  private getKinds(modT: number) {
    if (!this.clampKinds[modT]) {
      const { length } = getClampBoltSpec(modT);
      const spec = { ...CLAMP_FASTENER, length };
      this.clampKinds[modT] = {
        clampMid: this.boltGeometry(spec, this.purlinSection.t + modT - CLAMP_PROFILE.mid.floor, { socket: true }),
        clampSide: this.boltGeometry(spec, this.purlinSection.t + modT - CLAMP_PROFILE.side.floor, { socket: true }),
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
      batches[kind] = { kind: kind as keyof typeof kinds, parts, matrices: [] };
    }

    return {
      /** axis：螺栓轴线（指向螺母一侧），up：局部 y（长圆孔方向）。 */
      add: (kind: BoltKind, p: THREE.Vector3, axis: THREE.Vector3, up: THREE.Vector3, thickness?: number) => {
        const key = thickness === undefined ? kind : `${kind}:${thickness}`;
        if (thickness !== undefined && !isClamp(kind) && !batches[key]) {
          batches[key] = { kind, parts: this.connectionBolt(kind, thickness), matrices: [] };
        }
        const z = axis.clone().normalize();
        const y = up.clone().normalize();
        const x = new V3().crossVectors(y, z);
        batches[key].matrices.push(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p));
      },

      flush: (parent: THREE.Object3D, slopeParent: THREE.Object3D, purlinTieParent = slopeParent) => {
        const parents = { frame: parent, slope: slopeParent, purlinTie: purlinTieParent };
        for (const { kind, parts, matrices } of Object.values(batches)) {
          const target = isClamp(kind) ? slopeParent : parents[JOINT_FASTENER_RULES[kind].group];
          for (const [geometry, material] of parts) instanced(target, geometry, material, matrices, this.track);
        }
        return countBoltSets(batches);
      },
    };
  }
}
