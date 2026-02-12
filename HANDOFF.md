# Canvas Writer 交接文档

最后更新时间：2026-02-12

## 1. 项目概述
Canvas Writer 是一款本地优先的多模型写作应用（Electron + React + Vite）。核心功能：
- 输入提示词生成文章（Markdown）
- 选中文本后按指令局部改写，其他内容保持不变
- 版本历史、快照、差异对比
- 多供应商模型配置与调用（OpenAI 兼容、Gemini、MiniMax 中国等）

## 2. 当前版本与发布
- 当前版本：v0.1.7
- 最近 Release：v0.1.7（包含加密导入/导出供应商、按钮间距优化等）
- macOS DMG 输出路径：`release/Canvas Writer-<version>-arm64.dmg`

## 3. 运行与构建
常用命令：
- 开发：`npm run dev`
- 构建：`npm run build`
- 打包（macOS）：`npm run dist`

## 4. 供应商体系
支持的 API 类型：
- OpenAI 兼容
- Gemini (AI Studio)
- MiniMax (中国)

支持供应商导出/导入：
- 导出/导入仅包含供应商配置与 key，不包含文章与历史
- 导出文件格式：`*.cwprov`
- 加密：AES-256-GCM + scrypt

## 5. UI 与交互重点
- 左/中/右三栏布局（左：供应商 + 项目 + 历史；中：对话；右：文章）
- 主题：系统/浅色/深色，深色基底 #1A191F
- 供应商面板默认收起
- 历史项目 hover 显示删除

## 6. 数据存储
Electron 主进程（userData）保存：
- `store.json`：供应商与当前激活供应商
- `projects.json`：项目列表（内容与标题）
- `backups/`：自动备份（生成/改写前）

Web fallback（无 Electron API）：LocalStorage

## 7. Windows 绿色版
- 需求：生成 Windows portable.exe（无需安装）
- 已添加 GitHub Actions workflow：`.github/workflows/windows-portable.yml`
- 触发方式：GitHub Actions 手动触发 `Windows Portable Build`
- 产物：Artifact `canvas-writer-windows-portable`

## 8. 已知决策与约束
- 深色背景必须对齐参考图基色 #1A191F
- 导出/导入 key 禁止明文
- 对话与改写都是同一模型提供商 API
- 文章与历史不随供应商导出

## 9. 近期变更摘要（关键节点）
- v0.1.6：深色背景对齐；历史项目 hover 删除
- v0.1.7：供应商导入/导出（加密）；导入/导出密码输入框；按钮间距优化

## 10. 重要文件与目录
- 入口：`src/renderer/App.tsx`
- Electron 主进程：`src/main/main.ts`
- Preload：`src/main/preload.ts`
- Web fallback API：`src/renderer/webApi.ts`
- UI 样式：`src/renderer/styles.css`
- 工作流：`.github/workflows/windows-portable.yml`

## 11. 交接建议
给新工具/开发者：
- 项目源码完整目录
- 此交接文档
- 最近 Release 说明（GitHub Releases）
- 若需 Windows 包：指导执行 GitHub Actions 构建
