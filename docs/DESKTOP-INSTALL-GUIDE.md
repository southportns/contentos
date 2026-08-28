# Content OS — 桌面应用版安装指南

> Content OS Electron 桌面应用 — 免 Docker、免浏览器，一键安装

---

## 系统要求

### Windows
- Windows 10 64位 或更高
- 2GB 可用内存
- 500MB 可用磁盘空间

### macOS (未来支持)
- macOS 11 (Big Sur) 或更高
- 2GB 可用内存
- 500MB 可用磁盘空间

### Linux (未来支持)
- Ubuntu 20.04+ 或同等发行版
- 2GB 可用内存
- 500MB 可用磁盘空间

---

## 安装步骤

### 1. 下载安装包

从发布页面下载对应平台的安装包：

- **Windows 便携版 (推荐)**: `ContentOS-0.1.0-Portable.7z` (135MB)
- **Windows Zip 版**: `ContentOS-0.1.0-Portable.zip` (417MB)

### 2. 安装/解压

#### 方式 A: 7z 便携版 (推荐)
1. 下载 `ContentOS-0.1.0-Portable.7z`
2. 使用 [7-Zip](https://www.7-zip.org/) 解压到任意目录（如 `D:\ContentOS`）
3. 双击 `ContentOS.exe` 启动应用

#### 方式 B: Zip 便携版
1. 下载 `ContentOS-0.1.0-Portable.zip`
2. 右键 → 「全部解压」到任意目录
3. 双击 `ContentOS.exe` 启动应用

> 便携版无需安装，解压即用。可以放在 U 盘中随身携带。

### 3. 首次启动配置

首次启动 Content OS 桌面应用时：

1. 应用会自动初始化 SQLite 数据库（无需手动配置）
2. 数据库存储位置：
   - **Windows**: `%APPDATA%\content-os\contentos.db`
3. 应用窗口打开后，会显示 Content OS 主界面

### 4. 配置 AI Provider

在应用中配置 AI 服务：

1. 进入 **设置** 页面
2. 选择 AI 提供商（至少配置一个）：
   - **DeepSeek** (推荐国内用户)
     - API Key: 在 [DeepSeek 平台](https://platform.deepseek.com/) 获取
   - **OpenAI**
     - API Key: 在 [OpenAI 平台](https://platform.openai.com/) 获取
   - **Anthropic** (Claude)
     - API Key: 在 [Anthropic Console](https://console.anthropic.com/) 获取
   - **Google** (Gemini)
     - API Key: 在 [Google AI Studio](https://aistudio.google.com/) 获取
   - **智谱 GLM**
     - API Key: 在 [智谱开放平台](https://open.bigmodel.cn/) 获取
3. 选择默认模型
4. 保存配置

配置会持久化到：
- **Windows**: `%APPDATA%\content-os\.env.local`

---

## 使用方式

### 启动应用

- **Windows**: 从开始菜单或桌面快捷方式启动「Content OS」

### 主要功能

1. **内容研究** — 搜索热门内容、分析爆款
2. **内容创作** — AI 辅助选题、角度生成、内容写作
3. **内容管理** — 项目管理、灵感库、素材库
4. **人设管理** — 创建和管理内容人设

### 数据存储

所有数据存储在本地 SQLite 数据库中，不会上传到任何服务器：
- 内容项目
- 研究记录
- AI 生成历史
- 人设配置
- 灵感库

---

## 开发者信息

### 从源码构建桌面应用

```bash
# 1. 克隆项目
git clone <repo-url>
cd contextos

# 2. 安装依赖
npm install

# 3. 构建 Next.js
npm run build

# 4. 运行 prebuild（复制资源到 standalone）
npm run prebuild

# 5. 编译 Electron 主进程
npm run electron:compile

# 6. 重编译原生模块（better-sqlite3）
npm run electron:rebuild

# 7. 打包
npx electron-builder --config electron-builder.yml --win portable

# 或者一键执行（需注意文件锁问题）
npm run electron:dist

# 8. 生成的安装包在 electron-dist/ 目录
```

### 构建命令说明

| 命令 | 说明 |
|------|------|
| `npm run electron:dev` | 开发模式（热重载） |
| `npm run electron:build` | 构建桌面应用（不生成安装包） |
| `npm run electron:dist` | 构建 + 生成 Windows NSIS 安装包 |

### 项目结构

```
contextos/
├── electron/
│   ├── main.ts          # Electron 主进程
│   ├── preload.ts       # 预加载脚本
│   └── compile.ts       # 编译脚本
├── scripts/
│   ├── prebuild.ts      # 构建前准备（复制资源）
│   └── rebuild-native.ts # 重编译原生模块
├── electron-builder.yml  # electron-builder 配置
├── build/
│   └── icon.png          # 应用图标
└── src/                   # Next.js 应用代码
```

---

## 常见问题

### Q: 应用启动后白屏？

A: 这是 Next.js 服务器正在启动，请等待几秒钟。如果超过 30 秒仍然白屏，请检查：
1. 杀毒软件是否阻止了应用
2. 端口 3000 是否被其他程序占用

### Q: 数据库初始化失败？

A: 请检查应用数据目录的写权限：
- Windows: `%APPDATA%\content-os\`
- 确保杀毒软件没有阻止数据库文件创建

### Q: AI 功能不工作？

A: 请确认：
1. 已在设置页面配置了至少一个 AI Provider 的 API Key
2. API Key 有效且有余额
3. 网络可以正常访问 AI 服务

### Q: 如何备份数据？

A: 复制以下文件即可完成备份：
- **Windows**: `%APPDATA%\content-os\contentos.db`
- **Windows**: `%APPDATA%\content-os\.env.local`（包含 API Key 配置）

### Q: 如何卸载？

A: 
- **便携版**: 直接删除解压目录即可
- 用户数据保留在 `%APPDATA%\content-os\`，可手动删除

---

## 技术架构

```
Electron (桌面壳)
  ├── Main Process (electron/main.ts)
  │   ├── 启动 Next.js standalone server
  │   ├── 管理 SQLite 数据库
  │   └── 管理应用生命周期
  ├── Preload (electron/preload.ts)
  │   └── contextBridge 安全 API
  └── Renderer (Next.js App)
      ├── UI 层 (React Components)
      ├── API 层 (Next.js API Routes)
      ├── Agent 层 (Content Agent)
      ├── Skill 层 (AI Skills)
      └── Infrastructure (SQLite + DuckDuckGo)
```

---

## 与 Web 版的区别

| 特性 | 桌面版 | Web 版 |
|------|--------|--------|
| 安装方式 | 一键安装 | 需要部署服务器 |
| 数据库 | 本地 SQLite | PostgreSQL / SQLite |
| 搜索引擎 | DuckDuckGo | DuckDuckGo / Firecrawl |
| 数据存储 | 本地文件 | 服务器数据库 |
| 离线使用 | 部分（需 AI API） | 不支持 |
| 自动更新 | 未来支持 | 手动部署 |
| 跨平台 | Windows/macOS/Linux | 任意浏览器 |
