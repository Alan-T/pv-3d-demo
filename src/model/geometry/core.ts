import * as THREE from 'three';

// 图纸坐标使用 mm，Three.js 场景使用 m。x 向北，y 向上，z 向东。
export const MM = 0.001;
export const DEG = Math.PI / 180;
export const V3 = THREE.Vector3;
export const V = (x: number, y: number, z: number) => new V3(x * MM, y * MM, z * MM);
export const EX = new V3(1, 0, 0);
export const EY = new V3(0, 1, 0);
export const EZ = new V3(0, 0, 1);
export const NZ = new V3(0, 0, -1);
export const FONT = '"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif';

// 杆件：单位长度的截面几何体，靠矩阵基向量定方向、拉伸长度
export function addMember(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, origin: THREE.Vector3, X: THREE.Vector3, Y: THREE.Vector3, Z: THREE.Vector3) {
  const m = new THREE.Mesh(geo, mat);
  m.matrixAutoUpdate = false;
  m.matrix.makeBasis(X, Y, Z).setPosition(origin);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// 东西坡度的世界变换（ew 见 layoutEW）。不给 zRef：沿檩条方向剪切 (x, y, z) → (x, y + z·sin, z·cos)，
// 檩条、组件、压块跟着地面顺坡；给 zRef：榀位 zRef 那一榀整体平移到坡上，立柱仍竖直、构件不变形
export function ewMatrix(ew: { sa: number; ca: number }, zRef?: number) {
  const m = new THREE.Matrix4();
  if (zRef === undefined) m.set(1, 0, 0, 0, 0, 1, ew.sa, 0, 0, 0, ew.ca, 0, 0, 0, 0, 1);
  else m.makeTranslation(0, zRef * ew.sa * MM, zRef * (ew.ca - 1) * MM);
  return m;
}
export function ewPlace<T extends THREE.Object3D>(obj: T, ew: { sa: number; ca: number }, zRef?: number) {
  obj.matrixAutoUpdate = false;
  obj.updateMatrix();
  obj.matrix.premultiply(ewMatrix(ew, zRef));
  return obj;
}

// 连接件数量多（每榀几十个零件），全部用实例化网格
export function instanced(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  matrices: THREE.Matrix4[],
  track: (mesh: THREE.InstancedMesh) => unknown,
) {
  if (!matrices.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; // 单个几何体的包围球无法覆盖所有实例。
  mesh.castShadow = true;
  mesh.userData.noBox = true;
  parent.add(mesh);
  track(mesh);
}
