import * as THREE from 'three';

const MM = 0.001;

// 截面参数单位 mm。局部 x 沿截面高度，y 沿宽度，z 沿杆件长度。
// C 型钢腹板外表面在 y=0；圆管也以外包络 y=0 为基准，中心在 y=d/2。
function cChannelShape({ d: height, f: width, l: lip, t: thickness }) {
  const d = height / 2 * MM, f = width * MM, l = lip * MM, t = thickness * MM;
  const points = [[-d, 0], [d, 0], [d, f], [d - l, f], [d - l, f - t], [d - t, f - t], [d - t, t],
    [-d + t, t], [-d + t, f - t], [-d + l, f - t], [-d + l, f], [-d, f]];
  return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
}

function roundTubeShape({ d, t }) {
  if (!Number.isFinite(d) || !Number.isFinite(t) || t <= 0 || d <= 2 * t) {
    throw new RangeError('圆管截面要求 d > 2t > 0（单位 mm）');
  }
  const radius = d / 2 * MM;
  const shape = new THREE.Shape();
  shape.absarc(0, radius, radius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, radius, radius - t * MM, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

/** 旧的 {d,f,l,t} 参数默认 C 型；新类型通过 type 显式选择。 */
export function createSectionShape(section) {
  switch (section.type ?? 'C') {
    case 'C': return cChannelShape(section);
    case 'L': {
      const { d, f, t } = section;
      if (!(t > 0 && d > t && f > t)) throw new RangeError('角钢截面要求 d、f > t > 0');
      return new THREE.Shape([[0,0],[d,0],[d,t],[t,t],[t,f],[0,f]]
        .map(([x,y]) => new THREE.Vector2(x * MM, y * MM)));
    }
    case 'roundTube': return roundTubeShape(section);
    default: throw new RangeError(`不支持的截面类型：${section.type}`);
  }
}

/** 沿局部 z 拉伸 1 m，由构件放置矩阵缩放至实际长度。调用者负责释放。 */
export function createSectionGeometry(section) {
  return new THREE.ExtrudeGeometry(createSectionShape(section), { depth: 1, bevelEnabled: false });
}

/** 与杆件共用轮廓（包含圆管内孔），避免剖切封口与实际截面不一致。 */
export function createSectionCapGeometry(section) {
  return new THREE.ShapeGeometry(createSectionShape(section));
}
