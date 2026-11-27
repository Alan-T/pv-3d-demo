# 光伏固定支架 3D 项目优化方案（模块化 · 参数化 · 可读性）

> 本文档基于当前 `src/` 代码结构梳理，聚焦**代码模块化、模型参数化、代码可读性**三个维度，给出可分步落地的重构方案。

---

## 一、现状评估

目前项目已经具备较为清晰的三段式骨架：
- **规格解析**：`section-spec.ts`、`clamp-spec.ts`、`purlin-clip-spec.ts`、`purlin-connector-spec.ts`、`brace-connector-spec.ts`
- **几何求解**：`solve.ts`、`purlin-cut.ts`、`brace-layout.ts`、`post-tie-layout.ts`、`purlin-tie-layout.ts`
- **构件建模**：`parts/*.ts` 与 `bracket.ts`

当前主要痛点集中在：
1. **目录边界混杂**：`src/` 根目录下平铺了 40+ 个文件，纯计算层、3D 建模层、WebGL 渲染层、UI 桥接层混在一起。
2. **配置文件过载**：`src/config.ts`（477 行）同时承担选型字典、图纸预设、工程构造常量、UI 表单配置四类职责。
3. **隐式全局状态**：`core.ts`（`shared`）、`model-parameters.ts`（`P`、`show`）、`view.ts`、`edit.ts` 存在模块级可变状态，模块间通过隐式读取耦合。
4. **工程经验常数分散**：大量构造阈值与紧固件规则硬编码在 `solve.ts`、`parts/bolts.ts`、`parts/module.ts`、`post-tie-layout.ts`、`view.ts` 中，未完全参数化。
5. **可读性细节**：部分求解与标注文件（`solve.ts`、`dims.ts`、`joint-detail.ts`）仍存在单字母缩写与超长组件/控制器文件（`ParameterPanel.vue`、`designer.ts`）。

---

## 二、代码模块化优化方案

### 1. 按依赖方向分层整理 `src/` 目录

建议按“纯计算 → 3D 模型 → 渲染交互 → 应用装配 → UI 组件”的单向依赖收拢目录：

```text
src/
├── domain/                  # 纯计算与业务模型（零 Three.js / DOM 依赖，便于单测）
│   ├── design-types.ts
│   ├── solve.ts
│   ├── purlin-cut.ts
│   ├── brace-layout.ts
│   ├── post-tie-layout.ts
│   ├── purlin-tie-layout.ts
│   ├── layout-variants.ts
│   ├── report.ts
│   └── specs/               # 规格解析（section / clamp / purlin-clip / purlin-connector / brace-connector）
├── config/                  # 配置拆解
│   ├── catalogs.ts          # 规格库清单、材质选项、表面处理映射
│   ├── presets.ts           # 图纸预设 A / B 及公共模板
│   ├── engineering-rules.ts # 工程构造常量（替代/细化 FIX）
│   └── parameter-schema.ts  # PARAMETER_FIELDS / EXTRA_LIMITS / DISPLAY_DEFAULTS
├── model/                   # 3D 支架装配与构件几何（仅依赖 three + domain）
│   ├── bracket.ts
│   ├── part-options.ts
│   ├── part-types.ts
│   ├── geometry/            # section / drilled-section / clamp / purlin-connector / serrated-washer
│   └── parts/               # PostPart / BeamPart / BracePart / PurlinPart / ClampPart / BoltsPart ...
├── viewer/                  # 场景、相机、标注、交互编辑（强依赖 DOM / WebGL）
│   ├── scene.ts
│   ├── materials.ts
│   ├── view.ts
│   ├── dims.ts
│   ├── joint-detail.ts
│   ├── tie-joint-spec.ts
│   ├── tie-joint-focus.ts
│   ├── clipping-caps.ts
│   └── edit.ts
├── app/                     # 状态桥接与入口
│   ├── designer.ts
│   ├── model.ts
│   ├── model-parameters.ts
│   └── parameter-fields.ts
└── components/              # Vue 视图组件
```

**预期收益**：
- `domain/` 和 `config/` 完全不依赖 `three` 与浏览器全局对象，单元测试可直接针对纯计算层运行。
- 新成员可以快速定位“算尺寸”、“建模型”、“管渲染”、“做交互”的代码位置。

---

### 2. 拆分 `src/config.ts`（当前 477 行）

将 `src/config.ts` 按变更频率和职责拆分为 4 个文件：

| 目标文件 | 迁入内容 | 变更场景 |
| :--- | :--- | :--- |
| `config/catalogs.ts` | `CLAMP_SPECS`、`SECTION_LIB`、`TIE_SECTION_LIB`、`PURLIN_CLIP_SPECS`、`BRACE_CONNECTOR_SPECS`、`PURLIN_CONNECTOR_SPECS`、`MATERIAL_GRADE_OPTIONS`、`SURFACE_FINISH_OPTIONS`、`SURFACE_FINISH_BY_CORROSIVITY` | 增删型材规格、材质牌号或防腐等级 |
| `config/presets.ts` | `PRESETS`、`DEFAULTS` 及公共模板 | 调整或新增图纸模板（A / B / C） |
| `config/engineering-rules.ts` | `FIX` 及散落在各处的工程构造参数 | 调整构造边距、孔距、紧固件规则 |
| `config/parameter-schema.ts` | `PARAMETER_FIELDS`、`EXTRA_LIMITS`、`DISPLAY_DEFAULTS` | 调整 UI 面板参数、取值范围、步长 |

> 迁移期可保留原 `src/config.ts` 做统一 re-export，保证现有导入零破坏，分批替换引用。

---

### 3. 消除全局单例状态，改为显式 `RuntimeContext`

当前 `src/core.ts` 持有全局 `shared`（`disposables`、`labels`、`state`），`src/model-parameters.ts` 持有全局 `P` 和 `show`，`src/view.ts` 与 `src/edit.ts` 也各自维护模块级变量（`cam`、`tween`、`editEl`、`editing`）。

**优化方案**：
1. 将 `src/core.ts` 拆分为纯工具模块（`MM`、`DEG`、`V`、`addMember`、`ewMatrix`、`ewPlace`、`instanced`）和运行时上下文 `RuntimeContext`。
2. 由 `designer.ts` 创建并持有 `RuntimeContext` 实例（包含 `parameters`、`display`、`state`、`disposables`、`labels`），作为参数显式传入 `view`、`dims`、`edit`、`model`。
3. 为未来多视口/多实例预览及隔离单测扫清障碍。

---

### 4. 解耦 `report.ts` 中的“图纸核对基准”

目前 `src/report.ts` 中的 `buildPresetChecks` 把图纸 A / B 的预期核对数值硬编码在报表函数内部。

**优化方案**：
- 将各图纸预设的核对基准移到 `config/presets.ts` 旁（例如 `PRESET_BENCHMARKS`）。
- `report.ts` 只负责通用工程量汇总（钢材重量、螺栓套数、切割方案）与按传入基准对比，新增预设时无需修改报表逻辑。

---

## 三、模型参数化优化方案

### 1. 收拢散落在代码中的工程硬编码常量

目前仅部分尺寸放在 `FIX` 中，以下关键构造常数仍分散在各计算与建模文件中，建议统一归口到 `config/engineering-rules.ts`：

| 所在文件 | 当前硬编码值 | 业务含义 | 建议归口配置键 |
| :--- | :--- | :--- | :--- |
| `src/solve.ts` | `150` / `1000` / `100` / `300` | 悬挑最小告警、外斜撑建议阈值、后斜撑离地告警、前沿离地告警 | `SOLVE_RULES.warnings` |
| `src/solve.ts` | `0.4`（`maxEndOverhang`） | 檩条最大端悬挑与首末跨榀距比例 | `SOLVE_RULES.ew.maxEndOverhangRatio` |
| `src/solve.ts` | `10`（`Math.ceil(ret / 10) * 10`） | 斜梁下料长度取整模数（mm） | `SOLVE_RULES.beamLengthStep` |
| `src/purlin-cut.ts` | `CUT`、`PURLIN_CUT_GAP = 4` | 接缝间隙 4mm、距榀位 300–1000mm、避让组件缝 300mm | `PURLIN_CUT_RULES` |
| `src/post-tie-layout.ts` | `200` / `250` / `150` / `300` / `225` / `100` | 立柱拉杆净高余量、上下孔距范围、平地料长共用容差 ±100mm | `TIE_RULES.postTie` |
| `src/parts/module.ts` | `18` / `2` | 组件螺栓距短边内缩 18mm、组件边框翼缘厚度 2mm | `MODULE_MOUNTING` |
| `src/parts/purlin.ts` | `7`（`z > 7 && z < seg.length - 7`） | 檩条拉杆孔距端部最小边距（对应 Ø14 孔半径） | `TIE_RULES.purlinTie.holeRadius` |
| `src/parts/bolts.ts` | `BOLT_SIZE`、`35` / `40` / `22`、`{ radius: 12, thickness: 2 }` | 螺栓头/螺母/垫片尺寸表、各部位公称长度、大平垫规格 | `specs/fastener-spec.ts` |
| `src/parts/bolts.ts` | `serratedThickness = 0.6`、`4`（`recessDepth`） | 锯齿垫圈单片厚度、内六角沉孔深 | `specs/fastener-spec.ts` |
| `src/view.ts` | `SECTION`、`150` / `60` / `200` / `180` | 各节点详图剖切留边与轴测取景框大小 | `JOINT_VIEW_CONFIG` |

---

### 2. 紧固件选型与开孔规则数据驱动化

目前 `src/parts/bolts.ts` 的 `boltKind` 与 `collector.add()` 通过多层三元表达式与字符串数组判断来决定螺栓规格与长圆孔参数（如 `base === 'top' ? 16 : 12`、`['btop', 'postTie', 'purlinTie', 'splice'].includes(base)`）。

**优化方案**：
抽出一张声明式的**连接副规格映射表** `JOINT_FASTENER_RULES`（放入 `specs/fastener-spec.ts`）：

```ts
export const JOINT_FASTENER_RULES = {
  top:        { diameter: 16, length: 40, headWasher: true, spring: true, slot: { len: 40, width: 18, doubleSided: true } },
  foot:       { diameter: 12, length: 35, headWasher: true, spring: true, slot: { len: 28, width: 14, doubleSided: false } },
  footBrace:  { diameter: 12, length: 35, headWasher: true, spring: true, slot: { len: 28, width: 14, doubleSided: false } },
  btop:       { diameter: 12, length: 35, headWasher: true, spring: true, slot: null },
  postTie:    { diameter: 12, length: 35, headWasher: true, spring: true, slot: null },
  purlinTie:  { diameter: 12, length: 35, headWasher: true, spring: true, slot: null },
  splice:     { diameter: 12, length: 35, headWasher: true, spring: true, slot: null },
  clip:       { diameter: 12, length: 35, headWasher: true, spring: true, slot: null },
  clipWeb:    { diameter: 12, length: 35, headWasher: true, spring: true, slot: null },
  purlinBeam: { diameter: 12, length: 35, headWasher: true, spring: true, slot: null },
  module:     { diameter: 8,  length: 22, headWasher: true, spring: true, nutWasher: { radius: 12, thickness: 2 }, slot: null },
} as const;
```

**收益**：
- `BoltsPart` 彻底变成通用紧固件渲染器，新增连接点只需加一行配置。
- `report.ts` 与 `joint-detail.ts` 可直接引用规格表生成 `M16×40` / `M12×35` / `M8×22` 描述，避免模型与报表文案脱节。

---

### 3. 图纸预设模板化，消除 `PRESETS` 重复

当前 `src/config.ts` 中 `PRESETS.A` 和 `PRESETS.B` 各自重复定义了相同的项目资料（20 个字段）、表面处理（8 个字段）以及重复的 `sections` / `materials` 对象。

**优化方案**：
- 提取 `BASE_PROJECT_INFO`、`BASE_SURFACE_FINISHES`、`BASE_LAYOUT_MATERIALS`。
- 提供工厂函数 `createPreset(overrides)` 组装预设，预设文件体积可减少约 50%，不同图纸之间的参数差异一目了然。

---

### 4. 集中管理参数联动规则

目前参数联动分散在三个地方：
- `src/parameter-fields.ts`：`modL` 变化时限制 `hole <= modL - 200`。
- `src/designer.ts`：`purlinCutMode` / `purlinTies` 切换到 `custom` 时回填默认数组。
- `src/layout-variants.ts`：修改柱截面或 `outer` 时同步更新 `braceConnector` 规格。

**优化方案**：收拢到统一的领域协调函数（如 `reconcileParameters` / `reconcileLayout`），确保无论是左侧面板输入、3D 标注直接点击修改，还是切换排布，联动规则都严格一致。

---

## 四、代码可读性优化方案

### 1. 统一缩写与变量命名规范

当前求解与标注模块中存在较多单字母/双字母变量，阅读时需要频繁回溯上下文：
- `src/solve.ts`：`c, s, L, a, ret, ovh, tF, tR, O, gR, sp`
- `src/dims.ts`：`v, n, at, off, offN, pS, nrm, zsE, r, hN`
- `src/joint-detail.ts`：`fr, J, ax, ls, bp, mv, zl, pz`

**建议**：
- 内部局部变量逐步替换为语义化命名（如 `cosTilt`、`sinTilt`、`overhang`、`slopeNS`、`frameZPositions`、`anchorX`、`labelSide`）。
- 统一参数变量命名，避免同一文件内混用 `p`、`P`、`params`、`parameters`。

---

### 2. 拆分超长 Vue 组件与控制器

- **`src/components/ParameterPanel.vue`（234+ 行）**：
  - 按 Tab 与功能区块拆分为 `DesignParametersTab.vue`、`LayoutSectionControls.vue`、`ResultsReportTab.vue`，主面板仅负责 Tab 容器切换与事件转发。
- **`src/designer.ts`（401 行）**：
  - 将图纸/排布列表操作抽离为 `LayoutController`（或复用 `DrawingLayouts` 封装）。
  - 将快照拼装逻辑 `getSnapshot` 抽离为独立的 `buildSnapshot(context, drawings)` 纯函数。
  - 使 `createDesigner` 聚焦于渲染循环调度与事件响应。

---

### 3. 统一导出风格与关键类型单位注释

- **导出风格**：目前部分文件在末尾集中 `export { ... }`（如 `config.ts`、`dims.ts`、`edit.ts`），部分在声明处 `export`（如 `solve.ts`、`bracket.ts`）。建议统一为**声明处直接 `export`**，便于快速识别公开 API。
- **类型注释**：为 `Solution`、`EWLayout`、`BuildContext`、`JointSpecs` 等核心接口字段补充**单位（`mm` / `m` / `°` / `%`）**与**坐标系说明（沿坡局部坐标 vs 世界坐标）**。

---

### 4. 对齐 `PartOptions` 与构件实例化粒度

目前 `src/part-options.ts` 为 `post` 和 `brace` 传出的是合并配置（含 `postFSection` / `postRSection` 等），`src/bracket.ts` 中 `createFrameParts` 再手动拆分重组传给 `PostPart` / `BracePart`。

**优化方案**：在 `part-options.ts` 中直接按前后/内外复用结构输出公共 `postConfig`、`braceConfig` 或按实例映射，减少 `bracket.ts` 中的二次解构代码。

---

## 五、建议实施路线（分步落地，控制回归风险）

1. **P0（低风险、高收益 — 配置与规格收拢）**
   - 拆分 `config.ts` 为 `catalogs.ts`、`presets.ts`、`engineering-rules.ts`、`parameter-schema.ts`（`config.ts` 暂时做 re-export）。
   - 为 `PRESETS` 提取公共基础模板。
   - 抽离 `specs/fastener-spec.ts`，统一 `BoltsPart` 与 `report.ts` 的紧固件规格来源。
2. **P1（中风险 — 目录分层与参数化提取）**
   - 建立 `domain/`、`model/`、`viewer/`、`app/` 目录结构，保证 `domain/` 零 `three` 依赖。
   - 将 `solve.ts`、`post-tie-layout.ts`、`parts/module.ts`、`view.ts` 中的工程常数迁入 `engineering-rules.ts`。
3. **P2（架构演进 — 消除全局状态与大型文件拆分）**
   - 用 `RuntimeContext` 替代 `core.ts` / `model-parameters.ts` 的全局可变状态。
   - 拆分 `ParameterPanel.vue` 与 `designer.ts`，补齐核心类型字段的单位与坐标系注释。
