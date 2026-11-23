import { DBL, getLayoutParameters, JOINT, PURLIN_ACCESSORY_KEYS, SECTION_LABEL, SECTION_LIB } from './config.js';
import { braceConnectorSpec, needsSplitBraceConnector } from './brace-layout.js';
import { getPurlinDimensions } from './solve.js';

export { getLayoutParameters };

const postWidths = new Map(SECTION_LIB.map(({ name, d }) => [name, d]));

function updateBraceConnector(layout, sharedOuter) {
  const { sections } = layout;
  const outer = layout.outer ?? sharedOuter;
  const split = needsSplitBraceConnector(outer, postWidths.get(sections.postF) ?? 0, postWidths.get(sections.postR) ?? 0);
  sections.braceConnector = braceConnectorSpec(outer, split, JOINT, DBL);
}

function normalizeLayout({ sections, materials, ...layout }, sharedOuter) {
  const { braceConnectorF, braceConnectorR, ...specs } = sections ?? {};
  // 旧排布把檩托、檩条连接件存在顶层。新旧字段并存时使用 sections。
  for (const key of PURLIN_ACCESSORY_KEYS) {
    if (Object.hasOwn(layout, key)) {
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
  constructor(preset) {
    const { layouts, projectInfo, ...shared } = preset;
    if (!layouts.length) throw new RangeError('每张图纸至少需要一种排布');
    this.defaultShared = shared;
    this.defaultLayouts = layouts.map(layout => normalizeLayout(layout, shared.outer));
    this.sharedParameters = structuredClone(shared);
    this.layouts = this.defaultLayouts.map((layout, index) => ({
      ...structuredClone(layout), id: String(index + 1), label: `排布${index + 1}`,
    }));
    this.activeId = this.layouts[0].id;
    this.nextId = this.layouts.length + 1;
  }

  get active() {
    return this.layouts.find(item => item.id === this.activeId);
  }

  purlinLength(layout) {
    return getPurlinDimensions({ ...this.sharedParameters, ...getLayoutParameters(layout) }).purlinLen;
  }

  getCutSettings() {
    return {
      lengths: this.layouts.map(layout => this.purlinLength(layout)),
      maxLength: this.sharedParameters.maxPurlin,
    };
  }

  refreshDerivedValues(previousCuts) {
    // 预设存数值，下拉框返回字符串；只有料长上限实际改变才重切。
    const maxChanged = String(this.sharedParameters.maxPurlin) !== String(previousCuts.maxLength);
    this.layouts.forEach((layout, index) => {
      updateBraceConnector(layout, this.sharedParameters.outer);
      if (maxChanged || Math.abs(this.purlinLength(layout) - previousCuts.lengths[index]) > 1e-6) {
        layout.purlinCutMode = 'auto';
        layout.purlinCutLengths = [];
      }
    });
  }

  // P 是旧有三维模型、标注编辑器共用的参数对象。同一帧内编辑后即切换时也需记下最新值。
  captureParameters(parameters) {
    const previousCuts = this.getCutSettings();
    const active = this.active;
    const local = getLayoutParameters(active);
    for (const [key, value] of Object.entries(structuredClone(parameters))) {
      if (PURLIN_ACCESSORY_KEYS.includes(key)) active.sections[key] = value;
      else if (Object.hasOwn(local, key)) active[key] = value;
      else if (Object.hasOwn(this.sharedParameters, key)) this.sharedParameters[key] = value;
    }
    this.refreshDerivedValues(previousCuts);
  }

  getModelParameters() {
    return structuredClone({ ...this.sharedParameters, ...getLayoutParameters(this.active) });
  }

  select(id) {
    if (id === this.activeId || !this.layouts.some(item => item.id === id)) return false;
    this.activeId = id;
    return true;
  }

  add() {
    const id = String(this.nextId++);
    this.layouts.push({ ...structuredClone(this.active), id, label: `排布${this.layouts.length + 1}`, quantity: 1 });
    this.activeId = id;
  }

  remove(id) {
    const index = this.layouts.findIndex(item => item.id === id);
    if (index < 0 || this.layouts.length === 1) return false;
    this.layouts.splice(index, 1);
    for (let i = index; i < this.layouts.length; i++) {
      this.layouts[i].label = `排布${i + 1}`;
    }
    if (id === this.activeId) this.activeId = this.layouts[Math.min(index, this.layouts.length - 1)].id;
    return true;
  }

  setQuantity(value) {
    const count = Number(value);
    if (Number.isSafeInteger(count) && count > 0) this.active.quantity = count;
    return this.active.quantity;
  }

  setSection(key, name) {
    if (!Object.hasOwn(SECTION_LABEL, key)) return;
    const layout = this.active;
    layout.sections[key] = name;
    updateBraceConnector(layout, this.sharedParameters.outer);
  }

  setMaterialGrade(key, value) {
    const grades = this.active.materials;
    if (!Object.hasOwn(grades, key)) return undefined;
    if (typeof value === 'string') grades[key] = value.trim();
    return grades[key];
  }

  reset() {
    const previousCuts = this.getCutSettings();
    this.sharedParameters = structuredClone(this.defaultShared);
    const original = this.defaultLayouts[Number(this.activeId) - 1] ?? this.defaultLayouts[0];
    const index = this.layouts.findIndex(layout => layout.id === this.activeId);
    const { id, label, quantity } = this.layouts[index];
    this.layouts[index] = { ...structuredClone(original), id, label, quantity };
    this.refreshDerivedValues(previousCuts);
  }
}
