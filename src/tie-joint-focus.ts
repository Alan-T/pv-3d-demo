import { Color, DoubleSide, Mesh } from 'three';
import type { Material, Object3D, Texture } from 'three';
import type { TieJointType } from './joint-view-types.ts';

type Role = TieJointType | 'context';
type Surface = Material & { color?: Color; emissive?: Color; roughness?: number; metalness?: number; map?: Texture | null };
type MeshRecord = { mesh: Mesh; material: Mesh['material']; role: Role; castShadow: boolean; receiveShadow: boolean; context: Mesh['material'] | null };
type FocusGroups = { model: Object3D; postTies: Object3D; purlinTies: Object3D };
interface FocusOptions {
  track?: (material: Material) => Material;
  supportMaterials?: Partial<Record<TieJointType, Material[]>>;
}

const CONTEXT_COLOR = new Color(0xc4cbd3);
const CONTEXT_OPACITY = 0.22;
const SUPPORT_OPACITY = 0.85;

/** 拉杆节点专用外观：按构件归属替换材质，避免共享螺栓材质连带淡化拉杆紧固件。 */
export function createTieJointFocus(groups: FocusGroups, { track = resource => resource, supportMaterials = {} }: FocusOptions = {}) {
  const records: MeshRecord[] = [], contextMaterials = new Map<Material, Material>(), capMaterials = new Map<Material, Map<Role, Material>>();
  const originalMaterials = new WeakMap<Material, Material>();
  let activeType: TieJointType | null = null;

  function roleOf(mesh: Object3D): Role {
    for (let object: Object3D | null = mesh; object; object = object.parent) {
      if (object === groups.postTies) return 'postTie';
      if (object === groups.purlinTies) return 'purlinTie';
    }
    return 'context';
  }

  groups.model.traverse(mesh => {
    if (!(mesh instanceof Mesh)) return;
    records.push({ mesh, material: mesh.material, role: roleOf(mesh),
      castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, context: null });
  });

  function compileProperty<K extends "transparent" | "side" | "map">(material: Surface, key: K, value: Surface[K]) {
    if (material[key] === value) return;
    material[key] = value;
    material.needsUpdate = true;
  }

  function syncMaterial(material: Surface, source: Surface, subdued: boolean, cap: boolean) {
    const support = subdued && activeType && supportMaterials[activeType]?.includes(source);
    const muted = subdued && !support;
    if (source.color && material.color) {
      material.color.copy(source.color);
      if (muted) material.color.lerp(CONTEXT_COLOR, 0.9);
    }
    if (source.emissive && material.emissive) {
      material.emissive.copy(source.emissive);
      if (muted) material.emissive.multiplyScalar(0.1);
    }
    if ('roughness' in source) material.roughness = muted ? 0.9 : source.roughness;
    if ('metalness' in source) material.metalness = muted ? 0.05 : source.metalness;
    // 固定拉杆的立柱/檩条保留当前配色和材质质感，仅略透明。
    material.opacity = subdued
      ? (support ? SUPPORT_OPACITY : CONTEXT_OPACITY)
      : source.opacity;
    material.depthWrite = subdued ? false : source.depthWrite;
    compileProperty(material, 'transparent', subdued || source.transparent);
    compileProperty(material, 'side', cap ? DoubleSide : source.side);
    // 封口没有原构件的 UV；背景组件也去掉电池片纹理，保留浅色外形。
    compileProperty(material, 'map', null);
  }

  function cloneMaterial(source: Material) {
    const material = track(source.clone());
    originalMaterials.set(material, source);
    return material;
  }

  function contextMaterial(source: Material) {
    if (!contextMaterials.has(source)) contextMaterials.set(source, cloneMaterial(source));
    return contextMaterials.get(source)!;
  }

  /** view 先恢复原材质，再更新图纸配色/原有透明设置和生成封口。 */
  function restore() {
    for (const record of records) {
      record.mesh.material = record.material;
      record.mesh.castShadow = record.castShadow;
      record.mesh.receiveShadow = record.receiveShadow;
    }
  }

  /** 封口独立材质按原材质及构件类型复用，随 apply 更新而不改变原构件材质。 */
  function materialFor(source: Material, mesh: Object3D) {
    source = originalMaterials.get(source) ?? source;
    const role = roleOf(mesh);
    if (!capMaterials.has(source)) capMaterials.set(source, new Map());
    const roles = capMaterials.get(source)!;
    if (!roles.has(role)) roles.set(role, cloneMaterial(source));
    const material = roles.get(role)!;
    syncMaterial(material, source, !!activeType && role !== activeType, true);
    return material;
  }

  function apply(type: TieJointType | null) {
    activeType = type === 'postTie' || type === 'purlinTie' ? type : null;
    restore();
    if (activeType) {
      for (const record of records) {
        if (record.role === activeType) continue;
        record.context ??= Array.isArray(record.material)
          ? record.material.map(contextMaterial) : contextMaterial(record.material);
        record.mesh.material = record.context;
        record.mesh.castShadow = false;
        record.mesh.receiveShadow = false;
      }
      for (const [source, material] of contextMaterials) syncMaterial(material, source, true, false);
    }
    for (const [source, roles] of capMaterials) {
      for (const [role, material] of roles) syncMaterial(material, source, !!activeType && role !== activeType, true);
    }
  }

  return { restore, apply, materialFor };
}
