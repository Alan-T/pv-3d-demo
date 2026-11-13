import * as THREE from 'three';
import { MM } from './core.js';

/** 带 14×25 长圆孔的 U 型连接件，局部 x 截面高、y 翼缘宽、z 纵向单位长度。 */
export function createPurlinConnectorGeometry(spec) {
  const positions = [], normals = [], uvs = [];
  function plate(width, height, holes, matrix) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(width * MM, 0);
    shape.lineTo(width * MM, height * MM); shape.lineTo(0, height * MM); shape.closePath();
    for (const [x, y] of holes) {
      const r = spec.slotWidth / 2 * MM, half = (spec.slotLength - spec.slotWidth) / 2 * MM;
      const cx = x * MM, cy = y * MM, hole = new THREE.Path();
      hole.moveTo(cx + r, cy - half);
      hole.absarc(cx, cy - half, r, 0, -Math.PI, true);
      hole.lineTo(cx - r, cy + half);
      hole.absarc(cx, cy + half, r, Math.PI, 0, true);
      hole.closePath(); shape.holes.push(hole);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: spec.t * MM, bevelEnabled: false, curveSegments: 12 });
    geometry.applyMatrix4(matrix);
    // addMember 使用单位长度几何体；法线在归一化前保存，避免扭曲型材光照。
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) positions.push(p.getX(i), p.getY(i), p.getZ(i) / (spec.length * MM));
    normals.push(...geometry.attributes.normal.array);
    uvs.push(...geometry.attributes.uv.array);
    geometry.dispose();
  }
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  plate(spec.length, spec.d, spec.webHoles.map(z => [z + spec.length / 2, spec.d / 2]),
    new THREE.Matrix4().makeBasis(Z, X, Y).setPosition(-spec.d / 2 * MM, -spec.t * MM, 0));
  for (const a of [spec.d / 2, -spec.d / 2 + spec.t]) {
    plate(spec.length, spec.f - spec.t,
      spec.flangeHoles.map(z => [z + spec.length / 2, spec.flangeHoleOffset - spec.t]),
      new THREE.Matrix4().makeBasis(Z, Y, X.clone().negate()).setPosition(a * MM, 0, 0));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}
