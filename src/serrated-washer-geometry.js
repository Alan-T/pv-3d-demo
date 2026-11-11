import * as THREE from '../vendor/three.module.js';
import { MM } from './core.js';

/** 外齿扭转垫圈：内环平整，外缘窄切口，两侧齿尖分别翘起、压下。尺寸为 mm。 */
export function createSerratedWasherGeometry({ outerRadius, innerRadius, thickness, teeth = 18 }) {
  const positions = [];
  const rootRadius = innerRadius + (outerRadius - innerRadius) * 0.52;
  const triangle = (a, b, c) => positions.push(...a, ...b, ...c);
  const quad = (a, b, c, d) => { triangle(a, b, c); triangle(a, c, d); };
  const steps = 6;
  for (let tooth = 0; tooth < teeth; tooth++) {
    const surfaces = [-1, 1].map(side => [innerRadius, rootRadius, outerRadius].map((radius, radial) =>
      Array.from({ length: steps + 1 }, (_, i) => {
        const across = i / steps;
        // 切口向内收尖，齿顶保留圆形外轮廓。
        const gap = radial === 2 ? 0.055 : 0;
        const angle = (tooth + gap + across * (1 - 2 * gap)) * Math.PI * 2 / teeth;
        const twist = radial === 2 ? (2 * across - 1) * thickness : 0;
        const z = 1.5 * thickness + twist + side * thickness / 2;
        return [radius * Math.cos(angle) * MM, radius * Math.sin(angle) * MM, z * MM];
      })));
    const [bottom, top] = surfaces;
    for (let r = 0; r < 2; r++) for (let i = 0; i < steps; i++) {
      quad(top[r][i], top[r+1][i], top[r+1][i+1], top[r][i+1]);
      quad(bottom[r][i+1], bottom[r+1][i+1], bottom[r+1][i], bottom[r][i]);
    }
    for (let i = 0; i < steps; i++) {
      quad(bottom[2][i], bottom[2][i+1], top[2][i+1], top[2][i]);
      quad(bottom[0][i+1], bottom[0][i], top[0][i], top[0][i+1]);
    }
    // 外齿切口侧壁；内环各扇区共享边界，不生成内部重叠侧壁。
    quad(bottom[1][0], bottom[2][0], top[2][0], top[1][0]);
    quad(bottom[2][steps], bottom[1][steps], top[1][steps], top[2][steps]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
