import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createClippingCaps } from '../src/clipping-caps.js';
import { createSectionGeometry } from '../src/section-geometry.js';

const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const zCut = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);
function area(group) {
  let sum = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of group.children) {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      sum += b.sub(a).cross(c.sub(a)).length() / 2;
    }
  }
  return sum;
}
const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
function hit(group, x, y) {
  group.updateMatrixWorld(true);
  return new THREE.Raycaster(new THREE.Vector3(x, y, 0.4), new THREE.Vector3(0, 0, 1)).intersectObjects(group.children).length > 0;
}
function release(group) { for (const mesh of group.children) mesh.geometry.dispose(); }

test('截面封边保留 C/L 钢的开口，只补实际钢板厚度', () => {
  for (const [section, expected, solid, empty] of [
    [{ d: 100, f: 55, l: 20, t: 1.8 }, 437.04e-6, [0, .0009], [0, .03]],
    [{ type: 'L', d: 35, f: 35, t: 1.6 }, 109.44e-6, [.02, .0008], [.02, .02]],
  ]) {
    const geometry = createSectionGeometry(section), mesh = new THREE.Mesh(geometry, material);
    const caps = createClippingCaps(mesh, [zCut]);
    try {
      assert.equal(caps.children.length, 1);
      close(area(caps), expected, 1e-9);
      assert.equal(hit(caps, ...solid), true);
      assert.equal(hit(caps, ...empty), false);
      const positions = caps.children[0].geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) close(positions.getZ(i), .50002);
      assert.equal(caps.children[0].userData.sourceMesh, mesh);
    } finally { release(caps); geometry.dispose(); }
  }
});

test('闭合圆管截面保留内孔，封边不会堵住中空型材', () => {
  const geometry = createSectionGeometry({ type: 'roundTube', d: 100, t: 3 });
  const caps = createClippingCaps(new THREE.Mesh(geometry, material), [zCut]);
  try {
    assert.equal(caps.children.length, 1);
    assert.equal(hit(caps, 0, .05), false);
    assert.equal(hit(caps, .0485, .05), true);
    close(area(caps), Math.PI * (.05 ** 2 - .047 ** 2), 1.1e-5);
  } finally { release(caps); geometry.dispose(); }
});

test('任意斜切与非均匀缩放/剪切适用于 indexed 和 non-indexed 几何', () => {
  for (const indexed of [true, false]) {
    const original = new THREE.BoxGeometry(2, 2, 2), geometry = indexed ? original : original.toNonIndexed();
    const mesh = new THREE.Mesh(geometry, material), transform = new THREE.Matrix4().set(
      1.3, 0, 0, 3,
      0, .7, .2, 2,
      0, 0, 1.1, -4,
      0, 0, 0, 1);
    mesh.matrixAutoUpdate = false; mesh.matrix.copy(transform);
    const localPlane = new THREE.Plane(new THREE.Vector3(1, 0, 1).normalize(), 0);
    const plane = localPlane.clone().applyMatrix4(transform);
    const caps = createClippingCaps(mesh, [plane]);
    try {
      assert.equal(caps.children.length, 1);
      const a = new THREE.Vector3(-1, -1, 1).applyMatrix4(transform);
      const b = new THREE.Vector3(1, -1, -1).applyMatrix4(transform);
      const c = new THREE.Vector3(-1, 1, 1).applyMatrix4(transform);
      close(area(caps), b.sub(a).cross(c.sub(a)).length(), 2e-6);
      const positions = caps.children[0].geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) close(plane.distanceToPoint(new THREE.Vector3().fromBufferAttribute(positions, i)), .00002, 3e-7);
    } finally { release(caps); geometry.dispose(); if (!indexed) original.dispose(); }
  }
});

test('只处理可见且与保留区域相交的实例，跳过原截面封口和相切面', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1), mesh = new THREE.InstancedMesh(geometry, material, 3);
  mesh.setMatrixAt(0, new THREE.Matrix4());
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(20, 0, 0));
  mesh.setMatrixAt(2, new THREE.Matrix4().makeTranslation(0, 0, 20));
  const root = new THREE.Group(); root.add(mesh);
  const hidden = new THREE.Mesh(geometry, material); hidden.visible = false; root.add(hidden);
  const oldCap = new THREE.Group(); oldCap.userData.section = 'frame'; oldCap.add(new THREE.Mesh(geometry, material)); root.add(oldCap);
  const planes = [new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), 2)];
  const tracked = [], caps = createClippingCaps(root, planes, { track: value => (tracked.push(value), value) });
  const tangent = createClippingCaps(new THREE.Mesh(geometry, material), [new THREE.Plane(new THREE.Vector3(0, 0, 1), .5)]);
  try {
    assert.equal(caps.children.length, 1);
    assert.equal(caps.children[0].userData.instanceIndex, 0);
    assert.equal(caps.children[0].userData.sourceMesh, mesh);
    assert.equal(tracked.length, 1);
    assert.equal(tangent.children.length, 0);
    close(area(caps), 1);
  } finally { release(caps); release(tangent); geometry.dispose(); }
});

test('多材质组件仍形成完整闭环，映射材质及省略规则可用', () => {
  const geometry = new THREE.BoxGeometry(2, 1, 1);
  const materials = Array.from({ length: 6 }, (_, i) => new THREE.MeshBasicMaterial({ color: i, side: THREE.DoubleSide }));
  const mesh = new THREE.Mesh(geometry, materials), calls = [];
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const caps = createClippingCaps(mesh, [plane], { materialFor: (source, object) => { calls.push([source, object]); return material; } });
  const skipped = createClippingCaps(mesh, [plane], { materialFor: () => null });
  try {
    assert.equal(caps.children.length, 1);
    close(area(caps), 2);
    assert.ok(materials.includes(calls[0][0]));
    assert.equal(calls[0][1], mesh);
    assert.equal(caps.children[0].material, material);
    assert.equal(skipped.children.length, 0);
  } finally { release(caps); release(skipped); geometry.dispose(); materials.forEach(m => m.dispose()); }
});
