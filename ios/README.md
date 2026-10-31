# iOS 安装包（IPA）打包与 Apple ID 签名指南

这个目录是一个**原生 iOS 外壳应用**（SwiftUI + WKWebView），它把 `hongguo-mobile` 的网页界面装进一个真正的 App 里：桌面图标、独立全屏窗口、无 Safari 地址栏。

## 重要：为什么本机（Windows）打不出已签名的 IPA

编译 iOS 应用**必须有 Apple 的编译器和 macOS**（Xcode/clang 只跑在 macOS 上），这一步无法在 Windows 上完成。但签名可以完全由你自己的 Apple ID 完成，所以打包被拆成两步：

```
第 1 步：编译出"未签名 IPA"     ← 在 GitHub 免费云 Mac 上自动完成（或你有 Mac 就本地做）
第 2 步：用你的 Apple ID 签名    ← 在 Windows 上用 Sideloadly 完成
```

---

## 第 1 步：拿到未签名 IPA（两条路线任选）

### 路线 A：GitHub Actions 云端编译（推荐，无需 Mac）

1. 注册/登录 GitHub，新建一个仓库（可以是 Private 私有仓库）
2. 把本项目推上去（Windows 上执行）：

```bash
cd hongguo-mobile
git init
git add .
git commit -m "hongguo-mobile with iOS shell"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

3. 打开仓库页面 → **Actions** 标签 → 左侧 **Build unsigned IPA** → 右侧 **Run workflow** → 运行
4. 跑完后（约 3–5 分钟）在该次运行页面底部的 **Artifacts** 下载 `HongguoDrama-unsigned-ipa`，解压得到 `HongguoDrama-unsigned.ipa`

> 推送时 Actions 也会自动触发；以后改了 `ios/` 里的代码，push 就会重新出新包。

### 路线 B：本地 Mac 编译（如果你有 Mac）

```bash
brew install xcodegen
cd hongguo-mobile/ios
./build-ipa.sh        # 产出 HongguoDrama-unsigned.ipa
```

---

## 第 2 步：用 Apple ID 签名并安装（在 Windows 上）

### 方式一：Sideloadly（最常用）

1. 电脑装好 iTunes（从 Apple 官网下载，不要用微软商店版）与 iCloud
2. 下载 [Sideloadly](https://sideloadly.io) 并安装
3. iPhone 用数据线连电脑，打开 Sideloadly：
   - **IPA file**：选 `HongguoDrama-unsigned.ipa`
   - **Apple ID**：填你的 Apple ID（免费账号即可，无需付费开发者账号）
   - 点 **Start**，输入 Apple ID 密码（这是发给 Apple 官方接口签名，Sideloadly 不存储密码）
4. 完成后 iPhone 上出现"红果短剧"图标

### 方式二：AltStore

1. Windows 装 [AltServer](https://altstore.io)，手机装 AltStore
2. 把 IPA 拖到 AltStore 的"My Apps"里，用 Apple ID 签名安装

### 方式三：爱思助手

爱思助手的"应用游戏 → 导入安装"也可以用 Apple ID 对未签名 IPA 做自签安装，操作更中文向导化。

### 安装后必做：信任开发者证书

免费 Apple ID 签名的 App 首次启动会被系统拦，需要：

**设置 → 通用 → VPN 与设备管理 → 找到你的 Apple ID（开发者 App）→ 点"信任"**

---

## 装好之后怎么用

| 事项 | 说明 |
|---|---|
| 首次启动 | 显示"连接服务"页，填电脑上 `start.bat` 打印的地址，如 `192.168.1.5:8787` |
| 地址变了 | 长按画面**左上角 1 秒**呼出设置页改地址；连不上时错误浮层里也有"改地址"按钮 |
| 本地网络权限 | 首次连接会弹"允许 App 查找并连接本地网络"——**必须允许**，拒绝就连不上 |
| 后端 | 电脑上的 `npm start` 必须开着，手机/电脑要在同一 Wi-Fi |

## 免费签名的限制（Apple 官方规则）

- 签名 **7 天有效**，过期后 App 打不开，重新用 Sideloadly 签一次即可（数据不丢）
- 同时最多 **3 个**自签 App
- 每台设备需在 Apple ID 设备列表中注册（Sideloadly 自动处理）

## 目录结构

```
ios/
├── project.yml                  # XcodeGen 工程定义（生成 .xcodeproj）
├── build-ipa.sh                 # Mac 本地一键打包脚本
├── HongguoDrama/
│   ├── App.swift                # SwiftUI 入口
│   ├── RootView.swift           # 设置页 / WebView / 连接失败浮层
│   ├── AppConfig.swift          # 服务地址解析（自动补 http:// 和端口）
│   ├── WebView.swift            # WKWebView 外壳（内联播放、自动播、安全区）
│   ├── Info.plist               # ATS 放行 http、本地网络权限、横竖屏
│   └── Assets.xcassets/         # 应用图标（1024×1024）
└── .gitignore
```

## 常见问题

**Q: 打包时 Actions 报错？** 先看错误行；最常见是 XcodeGen 版本差异，重跑一次 Run workflow 通常即可。

**Q: 手机连上了但一直转圈？** 检查 Windows 防火墙是否放行 8787 端口（第一次 `npm start` 时弹窗选"允许"），以及手机是否连了访客 Wi-Fi（隔离设备）。

**Q: 能否像正规模样自动续签？** 付费开发者账号（$99/年）签名有效期 1 年；免费账号只能 7 天，AltStore 可在电脑开机时自动续签。
