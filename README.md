# 光伏支架 3D 设计 Demo

把一张固定倾角地面光伏支架的二维侧视图，做成可交互、可改参数的 three.js 3D 模型。

- 打开方式：直接双击 `index.html`（不需要服务器），或在本目录起任意静态服务器，例如 `python -m http.server 8765`。
- 不依赖网络：three.js r128 和 OrbitControls 在 `vendor/`（自带一份，不依赖其他项目），原图（去底色）以 data URI 形式放在 `assets/ref-side.js`，供“叠加原图”对照用。
- 建模、尺寸推算和假设都在 `app.js` 的 `FIX` / `solve()` 里；页面右侧“与图纸核对”和“推算 / 假设”两栏列出了每个尺寸的来源。

独立项目，整个文件夹可以直接拷走使用。

## 部署（阿里云 47.116.75.159，端口 257）

- 服务器目录 `/opt/pv-3d-demo`，systemd 服务 `pv-3d-demo`，由 `deploy/serve.js`（只用 Node 内置模块的静态文件服务，带 gzip，不对外提供 `deploy/`）在 257 端口提供页面。
- 与同机的 `wangmiao`（256）和 nginx 互不相干。
- 更新：打包本目录上传，解压覆盖 `/opt/pv-3d-demo`；只改了页面文件不用重启，改了 `deploy/serve.js` 才需要 `systemctl restart pv-3d-demo`。
