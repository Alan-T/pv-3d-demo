import type { MemberKey, NamedSection } from './design-types.ts';
import { SECTION_LIB, TIE_SECTION_LIB } from './config.ts';

/** 从截面规格字符串（如 C90*55*20*3.0、L35*35*1.6）解析截面尺寸。 */
export function parseSectionSpec(name: string): NamedSection {
  const cMatch = /^C(\d+)\*(\d+)\*(\d+)\*([\d.]+)$/.exec(name);
  if (cMatch) {
    const [, d, f, l, t] = cMatch;
    return { type: 'C', name, d: Number(d), f: Number(f), l: Number(l), t: Number(t) };
  }
  const lMatch = /^L(\d+)\*(\d+)\*([\d.]+)$/.exec(name);
  if (lMatch) {
    const [, d, f, t] = lMatch;
    return { type: 'L', name, d: Number(d), f: Number(f), t: Number(t) };
  }
  throw new Error(`无效的截面规格：${name}`);
}

export function getSectionSpec(name: string, key?: string): NamedSection | null {
  const specs = key ? (key === 'postTie' || key === 'purlinTie' ? TIE_SECTION_LIB : SECTION_LIB) : null;
  if (specs ? !specs.includes(name) : !SECTION_LIB.includes(name) && !TIE_SECTION_LIB.includes(name)) return null;
  return parseSectionSpec(name);
}

export function getSectionLibrary(key: string): NamedSection[] {
  const specs = key === 'postTie' || key === 'purlinTie' ? TIE_SECTION_LIB : SECTION_LIB;
  return specs.map(parseSectionSpec);
}

export function normalizeSection(name: string) {
  return name.toLowerCase().replace(/[×＊*]/g, 'x').replace(/\s+/g, '');
}

export function findSection(key: MemberKey, text: string) {
  const query = normalizeSection(text);
  if (!query) return undefined;
  const library = getSectionLibrary(key);
  return library.find(section => normalizeSection(section.name) === query)
    ?? library.find(section => normalizeSection(section.name).includes(query));
}
