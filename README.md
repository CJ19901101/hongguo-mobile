# 红果短剧 · 移动版（PWA）

基于开源项目 [jackotom/hongguo-drama](https://github.com/jackotom/hongguo-drama)（GPL-3.0）的片源解析能力做的 **iPhone 免越狱移动版**：
Electron 桌面应用无法在 iOS 上运行，本项目把它的 `src/native` 片源模块（搜索 / 解析 / CENC 解密）原样搬到一个 Node 后端，
前端做成移动优先的 PWA —— **iPhone 用 Safari 打开 → 添加到主屏幕**，即以全屏独立窗口运行，无需签名、无需 Mac、无需越狱。

## 功能

- **发现**：热播榜 / 真人剧 / 漫剧 / AI 剧分类浏览（红果官网目录）
- **搜索**：红果 + 西饭 + 河马三源聚合，支持分享链接 / 剧集 ID 解析（走红果通道）
- **播放**：服务端自动完成 CENC-AES-CTR 解密（含 moov 重建），iOS 原生硬解 HEVC/H.264
- **追剧**：断点续播、自动连播、0.75×–2× 倍速、选集面板、锁定集标记
- **预加载**：当前集起播后 2 秒，后台自动解密下一集并落盘；切集直接命中缓存（实测 1331ms → 150ms，约 9×）
- **进度条**：可拖动 / 点击跳转，带缓冲指示与时间显示；拖动中只预览、松手才提交 seek
- **手势**（画面区域，不与控件/选集面板冲突）：
  - 单击：显示 / 隐藏菜单
  - 双击：播放 / 暂停（带中央脉冲反馈）
  - 中部区域左右滑动：拖动播放进度，中央浮层实时显示目标时间与偏移量，松手生效
  - 右侧 1/5 区域上下滑动：上滑切下一集、下滑切上一集，浮层显示目标集数，滑过阈值后松手生效（不足阈值不切换）
  - 音量：网页在 iOS 上被系统禁止调整，此手势已取消；请用手机侧键
- **倍速**：0.75×–2×，切换后跨集保持（换源时自动同步 `playbackRate` 与 `defaultPlaybackRate`）
- **控件**：3 秒自动隐藏；上一集 / 播放暂停 / 下一集 / 倍速
- **我的**：观看记录与进度、最近搜索
- **PWA**：主屏幕图标、全屏独立窗口、安全区适配、应用壳离线缓存
- **原生 iOS App（可选）**：`ios/` 内置 SwiftUI + WKWebView 外壳，可打包成 IPA 用自己的 Apple ID 签名安装（免费签名 7 天有效），见 `ios/README.md`

## 运行

要求 Node.js ≥ 22.12。

```bash
npm install
npm start          # 默认 http://localhost:8787
```

或 Windows 双击 `start.bat`。

手机访问：与电脑连同一 Wi-Fi，浏览器打开启动时打印的局域网地址（如 `http://192.168.x.x:8787`）。
首次启动 Windows 防火墙弹窗请选择「允许访问」；如果手机打不开，检查防火墙入站规则中是否放行了 Node.js 的 8787 端口。

## 装到 iPhone（免越狱）

1. iPhone Safari 打开 `http://<电脑IP>:8787`
2. 分享 → **添加到主屏幕**
3. 从主屏幕图标启动，即为无地址栏的全屏独立应用

> PWA 的 Service Worker 仅在 HTTPS 或 localhost 下生效；局域网 HTTP 下跳过缓存不影响使用。
> 注意：iPhone 需要能与电脑互访（同一局域网），后端关掉手机端即不可用。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8787` | 服务端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `HGM_CACHE_MB` | `3072` | 解密视频磁盘缓存上限（MB，LRU 淘汰） |
| `HGM_CACHE_DIR` | `.cache/media` | 缓存目录 |
| `HGM_SECRET` | 随机生成并持久化 | 媒体令牌签名密钥 |

## 架构

```
public/          前端（原生 HTML/CSS/JS，无构建）
  index.html / styles.css / app.js / manifest.webmanifest / sw.js / icons/
server/
  index.js       Express：API + 媒体流（Range 分片）
  lib/sources.js 片源统一门面（红果/西饭/河马）
  lib/token.js   HMAC 媒体令牌（防开放代理/SSRF）
  lib/media-cache.js  解密产物磁盘缓存（LRU、并发去重、原子写入）
  vendor/native/ 复用自原仓库的片源模块（GPL-3.0，含 LICENSE/NOTICE）
scripts/         冒烟测试、MP4 结构校验、图标生成、UI 诊断
```

数据流：`客户端 → /api/play（返回签名令牌）→ /media/<token>（服务端取源 → deriveKey/contentKey → AES-CTR 逐样本解密 → 重建 moov → 按 Range 分片返回明文 MP4）`
上游直链不出服务端，令牌签名防伪造，客户端无法把服务当任意代理使用。

## 验证记录（2026-10-31）

- 真实链路：搜索「总裁」10 条 → 《诱情染指之黎野入怀》66 集 → 1080P HEVC 片源
- 解密：17.6MB 密文 → 解密后无 encv 残留；`scripts/validate-mp4.js` 校验 8393 个块偏移 0 越界（PASS）
- 浏览器端到端（Edge 移动视口）：播放器 `readyState=4`、`error=null`，选集/布局诊断通过
- 进度条回归（`scripts/test-player.js`）：拖到 20% 松手后 `currentTime=39.5s`；点击 85% 跳到 `166.4s`；播放/暂停与图标同步正常；194.8s 全长可 seek
- 预加载 A/B（`scripts/test-prewarm.js`，清空缓存后实测）：冷切集 1331ms → 预热后切集 150ms，提升 8.9×；`/api/warm` 冷 1712ms / 热 0ms（LRU 命中）
- 手势与倍速回归（`scripts/test-gestures.js`，Edge 移动视口）：22/22 通过——单击显隐菜单、双击暂停/恢复（带脉冲）、横滑定位（预期 53.7s 实际 53.73s）、右侧上滑切下一集 / 下滑回上一集 / 距离不足不切集、倍速 1.25× 切集后保持、中部竖滑不误触、选集面板交互不受影响、无页面错误

## 已知限制

- 红果源以 HEVC 为主，iPhone 7 及以上硬解正常；老设备如遇黑屏可在「播放」接口加 `quality=720p` 试试
- 服务端解密是整集下载后内存解密（每集约 10–40MB），首次起播有 1–3 秒准备时间，之后走磁盘缓存；播放中会自动预解密下一集，连续追剧时切换基本无感
- 音量不由网页控制（Apple 平台限制，视频音量随系统/侧键）；播放器手势不包含音量调节
- 原生 iOS App 用免费 Apple ID 签名 7 天过期，需重新签名；编译 IPA 需要 GitHub Actions 云端 Mac 或自备 Mac
- 锁定集（付费/限免范围外）会标黄点并拒绝播放，不做任何解锁
- 内容来自各平台公开接口，仅供学习研究；本项目继承 GPL-3.0，分发时须保留 LICENSE 与 NOTICE

## 致谢

片源模块来自 [jackotom/hongguo-drama](https://github.com/jackotom/hongguo-drama) 及其上游
[327044572/hongguo-downloader](https://github.com/327044572/hongguo-downloader) 等贡献者，详见 `server/vendor/NOTICE`。
