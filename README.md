# Wordbook Fresh 英语单词本

现有项目的本地增量升级：待学习 / 间隔复习分开，三按钮判断、两次连续认识通过当前轮次、已掌握管理、双语例句补充与朗读、旧数据保护。

**本次升级已获用户确认发布；实际部署状态请查看仓库 Actions。** 完整改动、默认参数、77项自动测试和真机未验证项目见 [本地交付报告](docs/LOCAL-UPGRADE-2026-10-29.md)。

## 本地运行

Node.js 22+，项目目录内：

```sh
npm ci
npm test
npm run build
npm run preview
```

预览默认为 http://127.0.0.1:5188/ 。首次测试/构建会校验并还原 resources 分卷内753个公开词库/OCR文件，需要系统tar（macOS/Linux自带）。不包含用户词库或秘密密钥。

## 使用

收藏单词后先进入待学习。首页可设置每日新词5/10/15/25，点击开始学习或去复习。先独立判断，再核对答案；不认识清零，连续两次认识只通过当前单词轮次。不再出现才永久掌握，已掌握可重新学习并保留历史。缺少穿插词时延后判断，保留未完成的单词轮次；复习参数集中在 src/learning.js。

词典卡可补充、编辑、删除双语例句，并朗读完整英文。默认使用已有内容、本地预制学习例句和免费Tatoeba直接配对语料，不存在前端秘密AI Key，也不调用收费AI。语料不能保证每个词义都覆盖，缺失与失败明确显示。系统语音效果依赖设备。

保留手动多词输入、文档上传（PDF/DOCX/TXT/MD/RTF及RTF内容DOC）、照片/截图/拍照OCR、候选人工确认、去重、JSON备份。可选跨App教程折叠显示；正式网址需部署本次版本后才支持恢复的分享接收。

## 数据与来源

IndexedDB仍使用原数据库，增量迁移保留卡片、用户编辑和历史。支持wordbook-1、wordbook-2备份，重复记录以本机现有数据优先。v2可恢复备份中的未完成轮次到空词库。不同网址/浏览器/PWA存储可能独立，请定期备份。

ECDICT MIT社区词库不是付费权威词典；部分IPA是旧式记法，界面有提示。例句来源、作者、许可逐条显示：本地35条学习句标明AI辅助编写，Tatoeba仅使用直接配对中文译文，许可CC BY 2.0 FR/CC0 1.0。翻译关系不等于全库已语义审校；运行时没有AI生成服务。Tesseract/PDF.js及依赖遵守各自许可。

## GitHub Pages

保留现有Actions配置，正式网址 https://houzero1001-hash.github.io/wordbook-fresh/ 。main 分支推送后自动测试、构建并部署；本次发布已获用户确认。

```sh
VITE_BASE_PATH=/wordbook-fresh/ BUILD_OUT_DIR=dist-pages npm run build
BUILD_OUT_DIR=dist-pages npm run test:pages
```

iPhone实机相机、相册、语音、系统分享与离线需额外验收；自动测试和320px桌面容器不等于真机测试。
