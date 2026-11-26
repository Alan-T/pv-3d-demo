import type { MemberKey, MemberSections, NamedSection } from './design-types.ts';
import { SECTION_LABEL, SECTION_LIB, TIE_SECTION_LIB } from './config.ts';

export function isMemberKey(key: string): key is MemberKey {
  return Object.hasOwn(SECTION_LABEL, key);
}

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

const isTie = (key: string) => key === 'postTie' || key === 'purlinTie';

export function getSectionSpec(name: string, key?: string): NamedSection | null {
  const specs = key ? (isTie(key) ? TIE_SECTION_LIB : SECTION_LIB) : null;
  if (specs ? !specs.includes(name) : !SECTION_LIB.includes(name) && !TIE_SECTION_LIB.includes(name)) return null;
  return parseSectionSpec(name);
}

export function getSectionLibrary(key: string): NamedSection[] {
  const specs = isTie(key) ? TIE_SECTION_LIB : SECTION_LIB;
  return specs.map(parseSectionSpec);
}

/** 从本次排布的规格名取得建模尺寸，标准构件用 C 型截面，拉杆也可用 L 型。 */
export function resolveMemberSections(names: Record<MemberKey, string>): MemberSections {
  const keys = Object.keys(SECTION_LABEL) as MemberKey[];
  return Object.fromEntries(keys.map(key => {
    const spec = getSectionSpec(names[key], key);
    if (!spec || (spec.type === 'L' && !isTie(key))) {
      throw new Error(`${SECTION_LABEL[key]}截面不存在：${names[key]}`);
    }
    return [key, spec];
  })) as MemberSections;
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
