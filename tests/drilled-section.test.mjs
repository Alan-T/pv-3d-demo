import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../vendor/three.module.js';
import { createDrilledAngleGeometry, createDrilledPurlinGeometry } from '../src/drilled-section-geometry.js';

test('Ø14孔贯通水平肢及檩条下翼缘，孔旁仍有实体',()=>{
  const length=3974, hole=85;
  const cases=[
    {geometry:createDrilledAngleGeometry({d:35,f:35,t:1.6},length,[hole]),y:.0175,x:-.01},
    {geometry:createDrilledPurlinGeometry({d:100,f:55,l:20,t:1.8},length,[hole]),y:.0275,x:-.06},
  ];
  for (const {geometry,y,x} of cases) {
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld();
    const ray=new THREE.Raycaster(new THREE.Vector3(x,y,hole/length),new THREE.Vector3(1,0,0),0,.02);
    assert.equal(ray.intersectObject(mesh).length,0,'孔心射线不应碰到板材');
    ray.ray.origin.y+=.01;
    assert.ok(ray.intersectObject(mesh).length>0,'孔外射线应碰到板材');
    geometry.dispose();material.dispose();
  }
});
