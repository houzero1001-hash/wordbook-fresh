# 我的英语单词本 · wordbook-fresh

独立的中文英语学习网页。正式地址：https://houzero1001-hash.github.io/wordbook-fresh/

## 开发与测试

Node.js 22，执行 `npm ci`、`npm test`、`npm run dev`。
`npm run build` 生成 dist。首次测试/构建自动校验并还原 resources 内的公开词库和 OCR 运行资源，需系统 tar（macOS/Linux 自带）。资源分卷仅含 ECDICT 和 Tesseract，不含用户词库。

GitHub Pages 构建：`VITE_BASE_PATH=/wordbook-fresh/ npm run build`，随后 `npm run test:pages`。
在仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。main 分支每次推送自动测试、构建、部署。发布状态以 Actions 成功记录为准。

## iPhone 跨 App 收藏

打开网站的「添加」→「从其他App收藏」→「设置 iPhone 快捷指令」。完整中文步骤位于 [public/iphone-guide.html](public/iphone-guide.html)。需在手机快捷指令中一次性手动配置共享表单；没有伪造的 iCloud 一键安装链接。

正式传入格式：`https://houzero1001-hash.github.io/wordbook-fresh/#collect?text=编码后的文字`。只对分享文字执行 URL 编码，随后打开 URL。网页先检查候选，用户确认后保存。单词去重并保留既有掌握状态；短语当前按单词拆分收藏。只有网页网址时不抓取网页或假定用户选择了文字。

不能分享文字的 App 可复制粘贴，或截图后在「添加」选择照片 OCR。OCR 不保证完全准确，必须人工确认。首次离线无法打开从未访问的网站。已缓存网站可复习本地数据，未缓存词典资料会提示缺失。

## 数据与成本

用户词库保存在浏览器 IndexedDB，不上传服务器；请定期 JSON 备份。不同网址、浏览器或主屏幕 Web App 的本地存储可能独立，跨环境请导出再导入并保留原备份。

ECDICT 静态词库 MIT 许可，原始出处与许可证在还原后的 public/dict/SOURCE.json、LICENSE.txt。Tesseract.js/核心和英文模型用于浏览器本地 OCR，许可证保存在公开资源中。PDF.js、fflate、idb 等依赖遵循各自许可证。首次下载词库分片、OCR和打开网站需要联网；没有付费 API Key，没有后台 AI 服务。GitHub 公共仓库 Pages 免费方案适用，受 GitHub 服务限制。

英文例句/译文和搭配覆盖有限，沿用已有来源标记与缺失提示；不把生成内容冒充词典原文。本次只改分享教程/入口与部署资源路径。

## 验证范围

自动化测试覆盖分享编码、网址过滤、确认后去重、掌握状态保护、既有复习/备份/文档解析回归与 Pages 子路径检查。iPhone Safari 实机系统分享、各 App 提供的输入类型、快捷指令动作名称、主屏幕存储与离线行为须真机验证。未经过真机测试的行为不视为验收通过。

发布仅包含本项目源码、人工合成测试文件和合法公开资源；不包含个人备份、密钥、node_modules、原始 ECDICT CSV、TapBook 或旧版 V4。
