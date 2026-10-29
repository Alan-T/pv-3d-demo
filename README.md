# 光伏支架 3D 设计 Demo

把一张固定倾角地面光伏支架的二维侧视图，做成可交互、可改参数的 three.js 3D 模型。

- 打开方式：直接双击 `index.html`（不需要服务器），或在本目录起任意静态服务器，例如 `python -m http.server 8765`。
- 不依赖网络：three.js r128 和 OrbitControls 在 `vendor/`（自带一份，不依赖其他项目），原图（去底色）以 data URI 形式放在 `assets/ref-side.js`，供“叠加原图”对照用。
- 图纸尺寸和假设在 `src/config.js`，尺寸推算在 `src/solve.js`；页面右侧“与图纸核对”和“推算 / 假设”两栏列出了每个尺寸的来源。

独立项目，整个文件夹可以直接拷走使用。

## 代码结构

代码在 `src/` 下，都是普通脚本（不用 ES 模块，所以双击打开也能用），每个文件把内容挂到全局 `PV` 上，按 `index.html` 里的顺序加载。

| 文件 | 内容 |
| --- | --- |
| `core.js` | 共用常量和工具（`MM`、`V()`、`addMember`、`instanced`），运行状态 `PV.state` |
| `config.js` | 图纸尺寸 `FIX`、两套图纸参数 `PRESETS`、连接件尺寸 `JOINT` / `DBL` / `CLIP`、面板参数和取值范围 |
| `solve.js` | 几何求解 `solve()`（框架平面内各关键点）和东西向布置 `layoutEW()`，纯计算 |
| `scene.js` / `materials.js` | 渲染器、相机、灯光；材质、贴图、配色、槽钢截面 |
| `parts/post.js` | 立柱（含埋地段） |
| `parts/beam.js` | 斜梁 + 立柱-斜梁螺栓 |
| `parts/brace.js` | 斜撑、外斜撑、斜撑连接板 + 斜撑两端螺栓 |
| `parts/purlin.js` | 檩条、檩托 + 檩托螺栓；剖切面上的檩条截面 |
| `parts/module.js` | 光伏组件 + M8 安装螺栓；剖切面上的组件截面 |
| `parts/bolts.js` | 螺栓规格和叠层；各构件登记螺栓位置，最后统一画成实例化网格 |
| `model.js` | 整体重建 `PV.build()`：求几何 → 依次调用各构件 → 剖切面封口 → 地面 → 标注、视图、面板 |
| `dims.js` / `joint-detail.js` | 尺寸标注；连接节点详图的引线标注 |
| `overlay.js` | 原图叠加 |
| `view.js` | 各视图显示哪些部分、轴测节点图的剖切范围、相机取景和切换动画 |
| `edit.js` / `panel.js` | 蓝字点击修改；右侧面板 |
| `main.js` | 启动和渲染循环（最后加载） |

每个构件文件导出 `build(c)`，`c` 是 `model.js` 里的构建上下文（参数 `P`、求解结果 `S`、东西向布置 `layout`、沿坡/法向单位向量 `u` / `n`、模型分组、螺栓收集器 `bolts`）。加新构件：在 `parts/` 下新建文件、在 `model.js` 里调用、在 `index.html` 里加 `<script>`。

调试：浏览器控制台里 `pvDemo` 可以读参数、求解结果，切视图、重建。

## 部署（阿里云 47.116.75.159，端口 257）

- 服务器目录 `/opt/pv-3d-demo`，systemd 服务 `pv-3d-demo`，由 `deploy/serve.js`（只用 Node 内置模块的静态文件服务，带 gzip，不对外提供 `deploy/`）在 257 端口提供页面。
- 与同机的 `wangmiao`（256）和 nginx 互不相干。
- 更新：打包本目录上传，解压覆盖 `/opt/pv-3d-demo`；只改了页面文件不用重启，改了 `deploy/serve.js` 才需要 `systemctl restart pv-3d-demo`。
