import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../vendor/three.module.js';
import { BoltsPart } from '../src/parts/bolts.js';
import { FIX, CLAMP, CLIP, JOINT, PARAMS, PRESETS } from '../src/config.js';

test('锯齿垫圈只替换组件头下平垫，大平垫、弹垫及压块保持不变', () => {
  const geometries = [];
  const material = new THREE.MeshBasicMaterial();
  const part = new BoltsPart({
    postSection: FIX.post, braceSection: FIX.brace, beamSection: FIX.beam,
    purlinSection: FIX.purlin, boltSteelMaterial: material, slotMaterial: material,
    CLAMP, CLIP, JOINT, track: g => (geometries.push(g), g),
  });
  function build(enabled, kind = 'module') {
    const collector = part.collector(33, { moduleSerratedWasher: enabled });
    collector.add(kind, new THREE.Vector3(), new THREE.Vector3(0,0,1), new THREE.Vector3(0,1,0));
    const group = new THREE.Group();
    const counts = collector.flush(group, group);
    return { geometries: group.children.map(mesh => mesh.geometry), counts };
  }
  const plain = build(false), serrated = build(true), restored = build(false);
  assert.deepEqual(plain.counts, serrated.counts);
  assert.equal(plain.counts.m8, 1);
  for (const i of [0,1,5]) {
    assert.deepEqual(plain.geometries[i].attributes.position.array, serrated.geometries[i].attributes.position.array);
  }
  assert.equal(serrated.geometries[4].type, 'BufferGeometry');
  for (const g of [plain.geometries[4], serrated.geometries[4]]) g.computeBoundingBox();
  assert.ok(Math.abs(serrated.geometries[4].boundingBox.max.z - serrated.geometries[4].boundingBox.min.z - .0018) < 1e-8);
  serrated.geometries[3].computeBoundingBox();
  assert.ok(Math.abs(serrated.geometries[3].boundingBox.max.z - serrated.geometries[4].boundingBox.min.z) < 1e-8);
  assert.equal(plain.geometries[4].boundingBox.max.z, serrated.geometries[4].boundingBox.max.z);
  assert.equal(restored.geometries[4], plain.geometries[4]);
  assert.deepEqual(build(false, 'clampMid').geometries, build(true, 'clampMid').geometries);
  const option = PARAMS.find(p => p.key === 'serratedWasher');
  assert.equal(option.when({fix:'bolt'}), true);
  assert.equal(option.when({fix:'clamp'}), false);
  for (const preset of Object.values(PRESETS)) assert.equal(preset.serratedWasher, false);
  geometries.forEach(g => g.dispose());
  material.dispose();
});
