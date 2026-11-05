# 光伏固定支架 3D 设计 Demo

根据固定倾角地面光伏支架图纸构建的交互式 three.js 模型。支持调整组件、榀距、坡度和固定方式，查看构件尺寸、檩条分段及连接节点。

- 仓库：[Alan-T/pv-3d-demo](https://github.com/Alan-T/pv-3d-demo)
- 在线演示：[光伏固定支架 3D 设计 Demo](http://47.116.75.159:257/)
- 技术：原生 JavaScript ES Modules、three.js r128、OrbitControls、HTML / CSS。
- 无需安装 npm 依赖或执行构建；运行资源随项目提供，不依赖 CDN。

## 本地启动

需要安装 Node.js，并使用支持 WebGL 和 ES Modules 的现代浏览器。

### Windows 一键预览

双击根目录的 `启动预览.bat`，脚本会检查 Node.js，在 `127.0.0.1:8765` 启动后台服务，等待就绪后自动打开浏览器。

已有项目服务时直接打开页面；端口被其他服务占用时会提示。关闭浏览器不会停止后台服务，需要停止时可在任务管理器中确认对应的 Node.js 进程后结束。

### 命令行启动

在项目根目录运行：

```powershell
node deploy/serve.js
```

打开 [本地预览](http://localhost:8765/)，按 `Ctrl+C` 停止服务。服务默认监听 `0.0.0.0:8765`；只允许本机访问或更换端口时，可在 PowerShell 设置：

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '8766'
node deploy/serve.js
```

此时访问 `http://localhost:8766/`。一键脚本固定使用 8765 端口。

ES Modules 需要通过 HTTP 加载，直接双击 `index.html` 使用 `file://` 会受到浏览器模块加载限制。

## 功能与操作

| 功能 | 说明 |
| --- | --- |
| 整体视图 | 3D、侧视、正视、俯视、垂直组件 |
| 连接节点 | 斜撑-立柱、立柱-斜梁、斜撑-斜梁、檩条-斜梁、檩条-组件、檩条-檩条 |
| 节点预览 | 正视 / 轴测，适用节点支持前侧 / 后侧；局部剖切、封口及引线标注 |
| 组件固定 | 安装孔螺栓或压块；压块模式下可选中压块 / 边压块，默认中压块 |
| 檩条分段 | 独立选择最大长度，展示每段长度、连接件及连接螺栓 |
| 显示控制 | 尺寸标注、埋地段、组件、连接件、图纸配色 |
| 计算结果 | 榀数、构件长度、连接件和螺栓数量、钢材估重及几何提示 |

拖动旋转，滚轮或双指缩放，右键或双指平移。蓝色尺寸可点击编辑，黑色尺寸为推算值。右侧参数面板和底部说明抽屉可以收起。

“垂直组件”视图对东西坡度进行展开，便于稳定查看组件布置和檩条分段；侧视图针对坡度进行了显示对齐。实际坡度空间关系可在 3D 视图查看。

## 参数与计算规则

尺寸以毫米为单位，渲染时换算为米。坐标约定：X 向北、Y 向上、Z 向东。

### 图纸方案

| 默认参数 | 图纸一 | 图纸二 |
| --- | --- | --- |
| 组件倾角 | 25° | 15° |
| 沿坡排数 × 东西列数 | 2 × 28 | 3 × 27 |
| 前后立柱间距 | 2900 | 3700 |
| 首末跨 / 中间跨榀距 | 2800 / 2800 | 3250 / 3250 |
| 南北坡度 | −5% | −2% |
| 东西坡度 | 0% | 0% |
| 外斜撑 | 无 | 有 |

两套方案默认组件尺寸均为 `2382×1134×35`，固定方式为螺栓，檩条最大长度为 9000。组件长、宽、厚可修改；沿坡和东西向组件间隙固定为 20。图纸尺寸、推算值和假设可结合页面的核对表与说明查看。

### 阵列、榀距与坡度

- 阵列宽 = 列数 × 组件宽 +（列数 − 1）× 20。
- 檩条总长 = 阵列宽 + 两端伸出量：螺栓固定每端 50，压块固定每端 100。
- 榀数取两端悬挑不超过首末跨榀距 0.4 倍的最少榀数；组件列数过少、无法放下相应榀数时会提示。
- 南北坡度正值表示北高南低，负值表示北低南高。前柱处地面作为 ±0，后柱按实际坡面保持埋深。侧视中水平基线不动，非零坡度时显示坡度线及后柱处高差。
- 东西坡度正值表示东高西低，负值表示东低西高。榀距、阵列宽和檩条长度按沿坡长度计，各榀立柱保持竖直。

若东西坡度百分数为 `s`，令 `i = s / 100`：

```text
水平距离 = 沿坡长度 / √(1 + i²)
高差     = 水平距离 × i
```

### 檩条切割与连接件

最大长度可选 `5700 / 7200 / 9000`，与表面处理无关联。算法位于 `src/purlin-cut.js` 的 `cutPurlin()`：

1. 总长不超过上限时保留一段。
2. 从檩条起点按 50 步长生成候选接头；距最近一榀为 300～1000，且避开固定点至少 300。
3. 螺栓固定时避让组件安装螺栓，压块固定时避让中压块及两端边压块。
4. 从理论最少段数开始搜索，在每段不超过上限的前提下，以动态规划优先选择段长较均匀的方案；搜索段数有上限。
5. 接缝宽 4，实际段长扣除间隙；总长等于各段长度与全部接缝长度之和。

无可行解时给出提示，并暂以通长檩条显示。分段长度可在俯视 / 垂直组件视图及计算结果中查看。

默认檩条为 **C100×55×15×1.8**；连接件为无卷边 **U108×55×3.0，长 240**，每个接头使用 6 套 M12×35。连接件随“按图纸配色”切换颜色。“檩条-檩条”节点预览实际接头。

连接件纵向孔位目前为模型假设，具体值见 `src/parts/purlin.js` 中的 `splice`。

### 默认连接规格

| 位置 | 规格 / 规则 |
| --- | --- |
| 组件安装孔 | M8×22 外六角螺栓，螺栓头和螺母下各有平垫 |
| 中压块 / 边压块 | M8×35 内六角螺栓，压块长度默认 50、可调 |
| 斜撑、立柱、斜梁及檩托 | M12，螺母下一个平垫、一个弹垫 |
| 斜撑端孔 | 孔心距端头 35 |
| 立柱顶部安装孔 | 孔心距柱顶 50，竖向长圆孔在立柱上 |

## 代码结构

`index.html` 仅加载 `src/main.js`。模块通过具名 `import/export` 声明依赖并显式调用函数，不再通过 `PV.parts` 或 `PV` 功能注册表间接调用。`src/core.js` 导出工具与共享运行状态 `shared`，参数由 `src/config.js` 导出。无打包流程，`deploy/serve.js` 保持 Node.js CommonJS 脚本。

| 文件 / 目录 | 职责 |
| --- | --- |
| `index.html` / `style.css` | 页面、视图按钮、参数面板与说明抽屉 |
| `启动预览.bat` | Windows 本地预览入口 |
| `src/core.js` | 单位、向量、矩阵工具、实例化及共享状态 |
| `src/config.js` | 图纸方案、默认截面、截面库、连接尺寸与参数范围 |
| `src/solve.js` | 框架几何、东西布置与榀数 |
| `src/purlin-cut.js` | 接头避让、切割方案搜索及分段长度 |
| `src/scene.js` / `src/materials.js` | 场景、相机、渲染器、材质、配色及透明显示 |
| `src/parts/post.js` | 立柱和埋地段 |
| `src/parts/beam.js` | 斜梁及柱顶连接螺栓 |
| `src/parts/brace.js` | 内外斜撑、连接板及螺栓 |
| `src/parts/brace-connector.js` | 单面 / 双面斜撑连接板、节点孔位及连接板螺栓 |
| `src/parts/purlin-connector.js` | U 型檩条连接件、规格及接头螺栓 |
| `src/parts/purlin-clip.js` | L 形檩托及底边、立边螺栓 |
| `src/parts/purlin.js` | 分段檩条、檩托、U 型连接件、连接螺栓与截面封口 |
| `src/parts/module.js` / `src/parts/clamp.js` | 组件、安装螺栓、中压块及边压块 |
| `src/parts/bolts.js` | 螺栓、螺母、垫圈几何及实例收集器 |
| `src/model.js` | 求解后组装构件、地面、封口、标注并刷新界面 |
| `src/part-options.js` | 将截面、材质、连接规格转换为各构件的构造参数，不读取页面状态 |
| `src/bracket.js` | `createBracket(parameters, dependencies)`：注入构件、求解器与剖切范围，返回模型分组、求解结果和布置；不挂载场景或刷新界面 |
| `src/dims.js` / `src/joint-detail.js` | 尺寸标注及节点引线 |
| `src/view.js` | 视图显隐、剖切、相机取景及动画 |
| `src/edit.js` / `src/panel.js` | 尺寸编辑、参数交互及计算结果 |
| `src/main.js` | 功能模块注册、初始化、渲染循环与调试入口 |
| `vendor/three.module.js` / `vendor/OrbitControls.js` | 本地 three.js r128 模块和相机控制器 |
| `deploy/` | 静态服务及 systemd 配置 |

构件的 `build(c)` 接收参数 `P`、求解结果 `S`、布置 `layout`、方向向量、模型分组和螺栓收集器。新增构件时，在 `src/parts/` 实现并导出构建函数，在 `src/model.js` 中导入并调用。螺栓模块提供收集器，统一生成实例化网格。

构件现由 `createBracket(parameters, dependencies)` 统一创建，各文件导出 `PostPart`、`BeamPart` 等类，通过 `new` 创建实例。构造函数直接解构 options，显式接收截面与连接规格、材质、截面几何工具和资源跟踪器；构建函数接收本次支架的上下文。`parts` 不直接导入页面配置和材质模块，几何缓存属于当前构件实例。`model.js` 是页面默认配置的组装入口。

修改后刷新浏览器即可。建议核对两套方案、非零坡度、两种固定方式及受影响节点。

浏览器控制台保留 `window.pvDemo` 调试接口：

```js
pvDemo.P;                 // 当前参数
pvDemo.state;             // 求解结果、布置与视图信息
pvDemo.setView('top');    // 切换俯视图
pvDemo.P.maxPurlin = 7200;
pvDemo.rebuild();         // 修改参数后重建
```

## 部署与维护

项目可由支持 JavaScript 模块 MIME 类型的静态 HTTP 服务托管。现有目录为 `/opt/pv-3d-demo`，systemd 服务名为 `pv-3d-demo`，监听 257 端口。

`deploy/serve.js` 仅依赖 Node.js 内置模块，支持 gzip、基于内容的 ETag 与缓存校验；点开头目录及 `deploy/` 不对外提供。

建议从已提交版本打包，避免携带本地配置、日志及 Git 目录：

```powershell
git -c core.autocrlf=false archive --format=tar.gz -o pv-3d-demo.tar.gz HEAD
```

服务器更新步骤：

1. 上传压缩包并核对校验值。
2. 备份当前 `/opt/pv-3d-demo`。
3. 解压覆盖到该目录，保留现有服务配置。
4. 只更新前端资源无需重启；修改 `deploy/serve.js` 后重启服务。
5. 检查入口及模块资源、模型加载和浏览器控制台。

```sh
sudo systemctl restart pv-3d-demo
sudo systemctl status pv-3d-demo
sudo journalctl -u pv-3d-demo -n 50 --no-pager
```

首次安装参考 `deploy/pv-3d-demo.service`，确认实际 Node.js 路径、运行用户及目录权限。该文件为低端口 257 配置了 `CAP_NET_BIND_SERVICE`。

## 常见问题

- **双击 HTML 加载失败**：使用一键脚本或 HTTP 服务，不使用 `file://`。
- **找不到 Node.js**：安装后重新打开终端，通过 `node --version` 确认可用。
- **端口被占用**：关闭对应服务，或使用命令行指定其他端口。
- **一直加载或模型空白**：检查 WebGL、控制台报错，以及入口和模块资源是否返回 200 与 JavaScript MIME 类型。
- **更新后仍显示旧内容**：强制刷新，并确认服务器文件已更新。
- **檩条没有分段**：总长可能未超过上限；若提示切割无可行解，调整榀距或最大长度。

### 构件实例

立柱和斜撑按位置分别实例化：`frontPost`、`rearPost`、`frontBrace`、`rearBrace`，启用外斜撑后再创建 `frontOuterBrace`、`rearOuterBrace`。它们接收单独的 `section`、`material` 和位置 / 节点参数；连接板由组装层单独构建，避免内外斜撑重复生成连接板。实例可从 `createBracket()` 返回值的 `instances` 读取。

```js
const post = new PostPart({
  postFSection: frontSection,
  postRSection: rearSection,
  postMaterial, buriedMaterial, extrudeC, track,
});
post.build(context);
```

`bracket.js` 根据 `partOptions` 创建完整支架的构件实例；组装器显式调用 `parts.post.build(context)` 等方法，连接件在所属构件内单独实例化。
