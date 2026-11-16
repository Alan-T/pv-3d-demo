import { PURLIN_CLIP_SPECS } from './config.js';

export function getPurlinClipSpec(name) {
  if (!PURLIN_CLIP_SPECS.includes(name)) return null;
  const match = /^L(\d+)\*(\d+)\*([\d.]+)\*(\d+)$/.exec(name);
  if (!match) throw new Error(`檩托规格格式错误：${name}`);
  const [, height, base, thickness, width] = match;
  return {
    name, height: Number(height), base: Number(base), t: Number(thickness), width: Number(width),
    // 规格图未给孔位：底边保持居中，立边沿用距底面 50 mm；两孔均在长度中线。
    baseBolt: Number(base) / 2, webBolt: 50,
  };
}
