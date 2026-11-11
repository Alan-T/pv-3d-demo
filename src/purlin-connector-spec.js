import { PURLIN_CONNECTOR_SPECS } from './config.js';

export function getPurlinConnectorSpec(name) {
  if (!PURLIN_CONNECTOR_SPECS.includes(name)) return null;
  const match = /^U(\d+)\*(\d+)\*([\d.]+)\*(\d+)$/.exec(name);
  if (!match) throw new Error(`檩条连接件规格格式错误：${name}`);
  const [, depth, flange, thickness, length] = match;
  const spec = { name, d: Number(depth), f: Number(flange), t: Number(thickness), length: Number(length) };
  const isShort = spec.length === 220;
  return {
    ...spec,
    // 两张详图：腹板孔距 30/50/60/50/30 或 35/50/70/50/35。
    webHoles: isShort ? [-80, -30, 30, 80] : [-85, -35, 35, 85],
    flangeHoles: isShort ? [-55, 55] : [-60, 60],
    // 55 翼缘详图孔心距外背30；45 翼缘为23；53 翼缘暂沿用宽翼30。
    flangeHoleOffset: spec.f === 45 ? 23 : 30,
    slotWidth: 14, slotLength: 25,
  };
}
