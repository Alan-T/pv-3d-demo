import type { DrawingPreset, LayoutPreset, ModelParameters, SharedParameters, PurlinAccessory, MaterialKey } from './design-types.ts';
import { PURLIN_ACCESSORY_KEYS } from '../config/catalogs.ts';
import { getLayoutParameters, splitDrawingPreset } from './model-parameters.ts';
import { isMemberKey } from './specs/section-spec.ts';
import { reconcileLayout, updateBraceConnector } from './parameter-rules.ts';
import { getPurlinDimensions } from './solve.ts';

export { getLayoutParameters };

export type DrawingLayout = LayoutPreset & { id: string; label: string };
type StoredLayout = LayoutPreset & Partial<Record<PurlinAccessory, string>> & {
  outer?: ModelParameters['outer'];
  sections: LayoutPreset['sections'] & { braceConnectorF?: string; braceConnectorR?: string };
};

function normalizeLayout({ sections, materials, ...layout }: StoredLayout, sharedOuter: ModelParameters['outer']) {
  const { braceConnectorF, braceConnectorR, ...specs } = sections ?? {};
  // 旧排布把檩托、檩条连接件存在顶层。新旧字段并存时使用 sections。
  for (const key of PURLIN_ACCESSORY_KEYS) {
    if (layout[key] !== undefined) {
      if (!Object.hasOwn(specs, key)) specs[key] = layout[key];
      delete layout[key];
    }
  }
  const normalized = {
    ...layout,
    sections: specs,
    materials: { ...materials },
  };
  updateBraceConnector(normalized, sharedOuter);
  return normalized;
}

export class DrawingLayouts {
  private readonly preset: DrawingPreset;
  sharedParameters!: SharedParameters;
  layouts!: DrawingLayout[];
  activeId!: string;
  private nextId!: number;

  constructor(preset: DrawingPreset) {
    this.preset = preset;
    this.reset();
  }

  reset() {
    const { layouts, sharedParameters } = splitDrawingPreset(structuredClone(this.preset));
    if (!layouts.length) throw new RangeError('每张图纸至少需要一种排布');
    this.sharedParameters = sharedParameters;
    this.layouts = layouts.map((layout, index) => ({
      ...normalizeLayout(layout, sharedParameters.outer), id: String(index + 1), label: `排布${index + 1}`,
    }));
    this.activeId = this.layouts[0].id;
    this.nextId = this.layouts.length + 1;
  }

  get active() {
    return this.layouts.find(item => item.id === this.activeId)!;
  }

  purlinLength(layout: LayoutPreset) {
    return getPurlinDimensions({ ...this.sharedParameters, ...getLayoutParameters(layout) }).purlinLen;
  }

  getCutSettings() {
    return {
      lengths: this.layouts.map(layout => this.purlinLength(layout)),
      maxLength: this.sharedParameters.maxPurlin,
    };
  }

  refreshDerivedValues(previousCuts: ReturnType<DrawingLayouts['getCutSettings']>) {
    // 预设存数值，下拉框返回字符串；只有料长上限实际改变才重切。
    const maxChanged = String(this.sharedParameters.maxPurlin) !== String(previousCuts.maxLength);
    this.layouts.forEach((layout, index) => {
      const lengthChanged = Math.abs(this.purlinLength(layout) - previousCuts.lengths[index]) > 1e-6;
      reconcileLayout(layout, this.sharedParameters.outer, maxChanged || lengthChanged);
    });
  }

  // 面板和标注可能在同一帧内编辑后切换排布，先保存当前参数。
  captureParameters(parameters: Partial<ModelParameters>) {
    const previousCuts = this.getCutSettings();
    const active = this.active;
    const local = getLayoutParameters(active);
    for (const [key, value] of Object.entries(structuredClone(parameters))) {
      if (key === 'purlinClip' || key === 'purlinConnector') {
        if (typeof value === 'string') active.sections[key] = value;
      }
      else if (Object.hasOwn(local, key)) Object.assign(active, { [key]: value });
      else if (Object.hasOwn(this.sharedParameters, key)) Object.assign(this.sharedParameters, { [key]: value });
    }
    this.refreshDerivedValues(previousCuts);
  }

  getModelParameters() {
    return structuredClone({ ...this.sharedParameters, ...getLayoutParameters(this.active) });
  }

  select(id: string) {
    if (id === this.activeId || !this.layouts.some(item => item.id === id)) return false;
    this.activeId = id;
    return true;
  }

  add() {
    const id = String(this.nextId++);
    this.layouts.push({ ...structuredClone(this.active), id, label: `排布${this.layouts.length + 1}`, quantity: 1 });
    this.activeId = id;
  }

  remove(id: string) {
    const index = this.layouts.findIndex(item => item.id === id);
    if (index < 0 || this.layouts.length === 1) return false;
    this.layouts.splice(index, 1);
    for (let i = index; i < this.layouts.length; i++) {
      this.layouts[i].label = `排布${i + 1}`;
    }
    if (id === this.activeId) this.activeId = this.layouts[Math.min(index, this.layouts.length - 1)].id;
    return true;
  }

  setQuantity(value: number | string) {
    const count = Number(value);
    if (Number.isSafeInteger(count) && count > 0) this.active.quantity = count;
    return this.active.quantity;
  }

  setSection(key: string, name: string) {
    if (!isMemberKey(key)) return;
    const layout = this.active;
    layout.sections[key] = name;
    updateBraceConnector(layout, this.sharedParameters.outer);
  }

  setMaterialGrade(key: string, value: string) {
    const grades = this.active.materials;
    if (!Object.hasOwn(grades, key)) return undefined;
    if (typeof value === 'string') grades[key as MaterialKey] = value.trim();
    return grades[key as MaterialKey];
  }
}
