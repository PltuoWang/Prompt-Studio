# Prompt Studio

Windows 本地 T2I / T2V / I2V 作品与提示词管理软件 · v0.3.0

**vibe coding by Haifeng.**

© 2026 Haifeng. All rights reserved.

## 下载与使用

从 [GitHub Releases](https://github.com/PltuoWang/vibecoding-app/releases/latest) 下载：

- **推荐：Prompt-Studio-Setup-0.3.0-x64.exe** — 中文安装向导，可选择安装位置，创建桌面和开始菜单快捷方式，支持系统卸载。
- **免安装：Prompt-Studio-Portable-0.3.0-x64.exe** — 双击即可使用的单文件 EXE，首次解包可能需要片刻。

两个版本都拥有独立桌面窗口，不打开浏览器，不显示命令行窗口，无需安装 Node.js。窗口关闭后程序退出，不驻留后台。

Windows 10 / 11 x64。当前发布包未进行商业代码签名，Windows 可能显示未知发布者；文件完整性可用同页 SHA256SUMS.txt 核对。

## 日常使用

- 创建提示词组，粘贴或拖入图片/视频，记录网络收藏、ComfyUI 或在线智能体生成的内容。
- 正向与负面提示词可自由编辑，修改自动保存；新版本从空白开始，也可明确选择复制为新版本。
- 对图片显示尺寸、比例，支持裁切；视频支持预览、时间信息和截帧。
- 点击“保存”，通过系统文件夹选择器选择位置，将作品与 TXT 提示词同名导出；保存后可直接打开文件夹。
- 设置中切换深浅主题、选择默认保存位置、创建或合并恢复完整备份、打开本地资料文件夹。
- Ctrl+K 搜索，Ctrl+S 保存；文本框右键支持复制、粘贴、撤销等常规操作。

窗口位置、大小、最大化状态和主题会被记住。重复启动会回到已打开窗口。关闭时先保存；导入中、未提交的表单或保存失败时会提醒。

## 一键备份与分享

- 侧栏“一键备份”直接保存完整 ZIP，包含所有组、历史版本、图片、视频、草稿和回收站。
- “备份与分享”可设置默认目录，导出全部或单个组；分享默认不含草稿和回收站。
- 分享包包含离线预览页，解压双击 index.html 即可查看图片、播放视频和复制提示词。
- 直接选择 ZIP 导入，校验原文件后合并，重复组保留为副本，不覆盖现有资料。
- ZIP 可以自行发给别人或上传网盘；本版本不自动上传个人资料。

## 数据与升级

资料位于 `%LOCALAPPDATA%\Prompt Studio\data`，与安装目录分离；日志位于 `%LOCALAPPDATA%\Prompt Studio\logs`。卸载不删除作品资料。

v0.2.1 Windows 便携包使用同一资料目录，退出旧版启动窗口后即可在桌面版继续使用。旧的源码开发版 data 目录不会自动覆盖导入；请在旧版创建完整备份，再在桌面版设置中合并恢复。

首次启动提供离线演示插画和示例提示词。所有创作资料保存在本机，不调用任何生成接口。发布包不包含开发者的个人资料。

## 开发与构建

需要 Windows、Node.js 22.12+、npm 和 Git。

```powershell
npm ci
node node_modules/electron/install.js
npm start
npm test
```

桌面主进程、预加载桥接位于 desktop/，界面位于 public/。开发浏览器版仍可运行 `npm run start:web`。

```powershell
powershell -NoProfile -File scripts/create-desktop-icon.ps1
npm run release
```

安装程序、免安装 EXE、源码 ZIP 和校验文件输出到 release/。源码 ZIP 来自已提交的 HEAD，发布前请先提交代码。Electron 和 electron-builder 版本固定在 package-lock.json。构建仅包括明确列出的应用文件，不包含 data、test-output、凭据或本地设置。

独立窗口启用沙箱、上下文隔离并禁用 Node 集成。窗口外无法直接调用内置数据接口；IPC 限制在本应用主窗口。后端随桌面主进程启动和退出，无需额外服务进程。

## 版权与边界

本项目保留版权，尚未授予开源许可。Electron、Chromium、Node.js 及其他依赖按各自许可证分发，程序目录含相关许可文件。

未提供生成接口、自动更新安装、视频转码或 ComfyUI 工作流自动解析。“查看新版本”打开官方 GitHub 下载页。媒体预览取决于内置播放器支持的编码。
