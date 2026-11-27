import * as THREE from 'three';
import { EY, V } from '../model/geometry/core.ts';
import type { TieJointSpec, ViewName } from '../model/joint-view-types.ts';

export type CameraPose = { target: THREE.Vector3; dir: THREE.Vector3; zoom: number };

// 相机位于 target + dir 一侧，朝 -dir 看。
export function screenAxes(dir: THREE.Vector3) {
  const right = new THREE.Vector3().crossVectors(EY, dir).normalize();
  return [right, new THREE.Vector3().crossVectors(dir, right).normalize()] as const;
}

/** 求世界坐标点在屏幕方向的宽高，并保留第一个点的深度作为相机目标。 */
export function projectedFrame(points: THREE.Vector3[], right: THREE.Vector3, up: THREE.Vector3) {
  const bounds = new THREE.Box2();
  const point = new THREE.Vector2();
  for (const world of points) bounds.expandByPoint(point.set(world.dot(right), world.dot(up)));
  const center = bounds.getCenter(new THREE.Vector2());
  const first = points[0];
  const target = first.clone()
    .addScaledVector(right, center.x - first.dot(right))
    .addScaledVector(up, center.y - first.dot(up));
  return { target, size: bounds.getSize(new THREE.Vector2()) };
}

// 坐标用米，文字相对于坐标的偏移量用屏幕像素。
type ProjectedPoint = { x: number; y: number; left: number; right: number; bottom: number; top: number };

function projectTieJoint(
  spec: TieJointSpec, annotations: THREE.Object3D | undefined, origin: THREE.Vector3,
  right: THREE.Vector3, up: THREE.Vector3, compact: boolean,
) {
  const points: ProjectedPoint[] = [];
  function project(local: THREE.Vector3, left = 0, rightEdge = 0, bottom = 0, top = 0) {
    const offset = local.clone().applyMatrix4(spec.matrix).sub(origin);
    points.push({ x: offset.dot(right), y: offset.dot(up), left, right: rightEdge, bottom, top });
  }

  const [x0, x1, y0, y1, z0, z1] = spec.clipBox;
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) project(V(x, y, z));

  const labelAxes = new THREE.Matrix3().setFromMatrix4(spec.matrix);
  annotations?.traverseVisible((object) => {
    if (object instanceof THREE.LineSegments) {
      const vertices = object.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) project(new THREE.Vector3().fromBufferAttribute(vertices, i));
    } else if (object instanceof THREE.Sprite) {
      const { outside, px, aspect } = object.userData;
      const height = px * (compact ? 1 : 1.25);
      const width = height * aspect;
      // 与 updateLabels 一致：引线文字沿屏幕水平外移，尺寸文字沿本地尺寸轴外移。
      const shift = outside.screenSide
        ? right.clone().multiplyScalar(outside.screenSide)
        : outside.dir.clone().applyMatrix3(labelAxes);
      shift.multiplyScalar(width / 2 + 6);
      const dx = shift.dot(right);
      const dy = shift.dot(up);
      project(outside.at, dx - width / 2, dx + width / 2, dy - height / 2, dy + height / 2);
    }
  });
  return points;
}

function pixelBounds(points: ProjectedPoint[], scale: number) {
  const box = new THREE.Box2();
  for (const point of points) {
    box.min.x = Math.min(box.min.x, point.x * scale + point.left);
    box.max.x = Math.max(box.max.x, point.x * scale + point.right);
    box.min.y = Math.min(box.min.y, point.y * scale + point.bottom);
    box.max.y = Math.max(box.max.y, point.y * scale + point.top);
  }
  return box;
}

// 模型随相机缩放，文字保持像素大小。二分求所有标注都能放入的最大比例（px/m）。
function fitWithLabels(points: ProjectedPoint[], width: number, height: number, maxScale: number) {
  let scale = 1;
  let limit = Math.min(3000, maxScale);
  for (let i = 0; i < 14; i++) {
    const mid = (scale + limit) / 2;
    const size = pixelBounds(points, mid).getSize(new THREE.Vector2());
    if (size.x <= width && size.y <= height) scale = mid;
    else limit = mid;
  }
  return { scale, center: pixelBounds(points, scale).getCenter(new THREE.Vector2()) };
}

export function tieJointPose(
  spec: TieJointSpec, name: ViewName, canvas: HTMLCanvasElement,
  annotations: THREE.Object3D | undefined, maxZoom: number,
): CameraPose {
  const localDirection = new THREE.Vector3(...(name === 'joint-elev' ? [0, 0, 1] : spec.isoDirection ?? [0.5, 0.35, 1]));
  const dir = localDirection.applyMatrix3(new THREE.Matrix3().getNormalMatrix(spec.matrix)).normalize();
  const [right, up] = screenAxes(dir);
  const origin = new THREE.Vector3().setFromMatrixPosition(spec.matrix);
  const width = canvas.clientWidth || 1;
  const height = canvas.clientHeight || 1;
  const compact = width < 520;
  const top = (canvas.parentElement?.querySelector<HTMLElement>('#bar')?.offsetHeight ?? 0) + 12;
  const bottom = (canvas.parentElement?.querySelector<HTMLElement>('#legend')?.offsetHeight ?? 0) + 24;
  const points = projectTieJoint(spec, annotations, origin, right, up, compact);
  const { scale, center } = fitWithLabels(points, width - (compact ? 24 : 64), Math.max(24, height - top - bottom), maxZoom * height / 2);
  const target = origin
    .addScaledVector(right, center.x / scale)
    .addScaledVector(up, (center.y + (top - bottom) / 2) / scale);
  return { target, dir, zoom: 2 * scale / height };
}
