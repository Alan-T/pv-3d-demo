import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createTieJointFocus } from '../src/tie-joint-focus.ts';

function fixture() {
  const geometry = new THREE.BoxGeometry();
  const steel = new THREE.MeshStandardMaterial({ color: 0xf0a020 });
  const bolt = new THREE.MeshStandardMaterial({ color: 0xb4b4b4, metalness: 0.5 });
  const postTieMaterial = new THREE.MeshStandardMaterial({ color: 0x168eae });
  const purlinTieMaterial = new THREE.MeshStandardMaterial({ color: 0xa34fba });
  const moduleMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: new THREE.Texture() });
  const groups = { model: new THREE.Group(), postTies: new THREE.Group(), purlinTies: new THREE.Group() };
  groups.postTieHardware = new THREE.Group();
  groups.purlinTieHardware = new THREE.Group();
  groups.model.add(groups.postTies, groups.purlinTies);
  groups.postTies.add(groups.postTieHardware);
  groups.purlinTies.add(groups.purlinTieHardware);
  const add = (group, material, instanced = false) => {
    const mesh = instanced ? new THREE.InstancedMesh(geometry, material, 2) : new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const column = add(groups.model, steel), frameBolt = add(groups.model, bolt, true);
  const postTie = add(groups.postTies, postTieMaterial), postBolt = add(groups.postTieHardware, bolt, true);
  const purlinTie = add(groups.purlinTies, purlinTieMaterial), purlinBolt = add(groups.purlinTieHardware, bolt, true);
  const moduleMats = [steel, moduleMaterial, steel];
  const module = add(groups.model, moduleMats);
  module.castShadow = false;
  const resources = [];
  const focus = createTieJointFocus(groups, { track: resource => (resources.push(resource), resource) });
  return { groups, steel, bolt, postTieMaterial, purlinTieMaterial, moduleMaterial, moduleMats,
    column, frameBolt, postTie, postBolt, purlinTie, purlinBolt, module, resources, focus,
    dispose() {
      geometry.dispose();
      moduleMaterial.map.dispose();
      for (const material of [steel, bolt, postTieMaterial, purlinTieMaterial, moduleMaterial, ...resources]) material.dispose();
    } };
}

test('拉杆及其紧固件保持原材质，共享螺栓材质的非拉杆构件单独淡化', () => {
  const f = fixture();
  try {
    f.focus.apply('postTie');
    assert.equal(f.postTie.material, f.postTieMaterial);
    assert.equal(f.postBolt.material, f.bolt);
    assert.notEqual(f.frameBolt.material, f.bolt);
    assert.equal(f.frameBolt.material.opacity, 0.22);
    assert.equal(f.frameBolt.material.depthWrite, false);
    assert.equal(f.frameBolt.castShadow, false);
    assert.equal(f.column.receiveShadow, false);
    assert.equal(f.postBolt.castShadow, true);
    assert.equal(f.bolt.opacity, 1);
    assert.equal(f.bolt.transparent, false);
    assert.equal(f.steel.color.getHex(), 0xf0a020);
    assert.equal(f.module.material[1].map, null);
    assert.notEqual(f.moduleMaterial.map, null);
    f.focus.apply('purlinTie');
    assert.equal(f.purlinBolt.material, f.bolt);
    assert.equal(f.purlinTie.material, f.purlinTieMaterial);
    assert.notEqual(f.postBolt.material, f.bolt);
  } finally { f.dispose(); }
});

test('退出节点准确恢复单/多材质引用及阴影状态，重复切换复用克隆', () => {
  const f = fixture();
  try {
    f.groups.purlinTies.visible = false;
    f.focus.apply('postTie');
    f.focus.apply('purlinTie');
    const count = f.resources.length, contextBolt = f.frameBolt.material;
    for (let i = 0; i < 4; i++) {
      f.focus.apply('postTie');
      f.focus.apply('purlinTie');
      f.focus.apply(null);
    }
    assert.equal(f.resources.length, count);
    assert.equal(f.column.material, f.steel);
    assert.equal(f.frameBolt.material, f.bolt);
    assert.equal(f.module.material, f.moduleMats);
    assert.equal(f.module.castShadow, false);
    assert.equal(f.module.receiveShadow, true);
    assert.equal(f.column.castShadow, true);
    assert.equal(f.groups.purlinTies.visible, false);
    f.focus.apply('postTie');
    assert.equal(f.frameBolt.material, contextBolt);
    f.focus.restore();
    assert.equal(f.frameBolt.material, f.bolt);
  } finally { f.dispose(); }
});

test('封口按构件归属分离共享材质，配色和透明状态同步且不反向污染原材质', () => {
  const f = fixture();
  try {
    const postCap = f.focus.materialFor(f.bolt, f.postBolt);
    const contextCap = f.focus.materialFor(f.bolt, f.frameBolt);
    const tieCap = f.focus.materialFor(f.postTieMaterial, f.postTie);
    assert.notEqual(postCap, contextCap);
    assert.equal(f.focus.materialFor(f.bolt, f.postBolt), postCap);
    f.focus.apply('postTie');
    assert.equal(postCap.opacity, 1);
    assert.equal(contextCap.opacity, 0.22);
    assert.equal(postCap.side, THREE.DoubleSide);
    assert.equal(contextCap.side, THREE.DoubleSide);
    assert.equal(f.bolt.side, THREE.FrontSide);
    const contextColor = f.column.material.color.clone();
    f.focus.restore();
    f.postTieMaterial.color.setHex(0xb8bfc5);
    f.steel.color.setHex(0xb8bfc5);
    f.focus.apply('postTie');
    assert.equal(tieCap.color.getHex(), 0xb8bfc5);
    assert.notEqual(f.column.material.color.getHex(), contextColor.getHex());
    const version = contextCap.version;
    f.focus.apply('postTie');
    assert.equal(contextCap.version, version, '同状态更新不重复标记着色器重编译');
    f.bolt.opacity = 0.42;
    f.bolt.transparent = true;
    f.bolt.depthWrite = false;
    f.focus.apply(null);
    assert.equal(contextCap.opacity, 0.42);
    assert.equal(contextCap.transparent, true);
    assert.equal(contextCap.depthWrite, false);
  } finally { f.dispose(); }
});
