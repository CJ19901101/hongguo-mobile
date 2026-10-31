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

> 本目录所在的项目**已经初始化好 git 仓库并完成首次提交**（82 个文件，已排除 `node_modules`、`.cache`、测试视频）。你只需要：建仓库 → 加远端 → push → 下载产物。

#### A-1 建一个空仓库（网页操作，约 1 分钟）

1. 打开 <https://github.com> 登录（没账号先注册，**必须验证邮箱**，否则 Actions 不可用）
2. 右上角 **+** → **New repository**
3. 填写：
   - **Repository name**：`hongguo-mobile`（随便起）
   - **Description**：可留空
   - **Visibility**：`Private`（推荐）或 `Public`
     - Private：每月 2000 分钟免费额度，但 macOS 机器按 **10 倍**计费 → 实际约 200 分钟，一次构建花 ~40 分钟额度，够跑 5 次/月
     - Public：Actions **完全免费无限**，但代码公开（本项目是 GPL-3.0 第三方客户端，公开无额外风险）
   - **不要**勾选 "Add a README file"、"Add .gitignore"、"Choose a license"——必须建**空仓库**，否则 push 会冲突
4. 点 **Create repository**，复制页面上的仓库地址，形如
   `https://github.com/你的用户名/hongguo-mobile.git`

#### A-2 推送代码（Windows 命令行，约 1 分钟）

在项目目录执行（把地址换成你自己的）：

```bash
cd hongguo-mobile
git remote add origin https://github.com/你的用户名/hongguo-mobile.git
git push -u origin main
```

推送时 Git 会弹出浏览器窗口要求登录 GitHub（Git Credential Manager 自动处理），点 **Authorize** 即可，**不需要**手动生成 token。

> 如果弹窗没出现或提示认证失败，可在 GitHub 上生成 Personal Access Token（Settings → Developer settings → Personal access tokens → Tokens(classic) → Generate new token，勾 `repo` 权限），然后把密码位置填这个 token。

#### A-3 等它自己跑（约 3–5 分钟）

push 成功后：仓库页面顶部 **Actions** 标签 → 左侧列表 **Build unsigned IPA** → 应该已经有一条正在跑的任务（因为本次提交包含 `ios/` 变更，工作流自动触发）。

没自动触发就手动：**Actions** → 选 **Build unsigned IPA** → 右侧 **Run workflow** → 分支选 `main` → 绿色 **Run workflow** 按钮。

点进那次运行，能看到 6 个步骤依次变绿：

| 步骤 | 在做什么 | 耗时 |
|---|---|---|
| Checkout | 拉取代码 | ~5s |
| Install XcodeGen | 装工程生成器 | ~40s |
| Generate Xcode project | 生成 `.xcodeproj` | ~2s |
| Build (unsigned, device arm64) | 真正的 Swift 编译（arm64 真机包） | 1–3 分钟 |
| Package IPA | 打成 `Payload/` + zip 成 ipa | ~10s |
| Upload artifact | 上传产物 | ~10s |

右上角出现绿色 ✅ 即成功。

#### A-4 下载 IPA

1. 在**该次运行页面**，滚到最底部 **Artifacts** 区域
2. 点 **HongguoDrama-unsigned-ipa** 下载（文件名会是 `HongguoDrama-unsigned-ipa.zip`）
3. 解压这个 zip，里面就是 **`HongguoDrama-unsigned.ipa`**（约 3–6 MB）

拿到这个文件就进入[第 2 步](#第-2-步用-apple-id-签名并安装在-windows-上)。

#### A-5 以后怎么重新出包

改了 `ios/` 里的 Swift 代码 → `git add . && git commit -m "改了什么" && git push` → 自动重新构建。
只想重新跑一次（代码没改）：Actions → Run workflow。

#### A-6 构建失败了怎么排查

点进失败的运行 → 左侧点红色 ❌ 的那一步 → 展开日志，把最后 30 行发我。常见情况：

| 现象 | 原因与处理 |
|---|---|
| `xcodegen: command not found` | brew 安装步骤失败，重跑一次 Run workflow 一般就好 |
| `error: Signing for "HongguoDrama" requires a development team` | 说明 `CODE_SIGNING_ALLOWED=NO` 没生效，检查工作流里该参数是否被改动 |
| `error: unable to find utility "xcodebuild"` | runner 镜像暂时异常，把 `runs-on` 改成 `macos-14` 或 `macos-latest` 再跑 |
| `No such file or directory: ios/HongguoDrama-unsigned.ipa` | Package IPA 步骤失败，往上看 `find` 找到的 app 路径 |
| 运行按钮是灰色 | 仓库 Settings → Actions → General → 选 **Allow all actions and reusable workflows** → Save |

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
