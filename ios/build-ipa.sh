#!/usr/bin/env bash
# 在 macOS 上把本项目打包成"未签名 IPA"（之后用 Apple ID 通过 Sideloadly / AltStore / 爱思助手签名安装）
# 用法：./ios/build-ipa.sh
set -euo pipefail
cd "$(dirname "$0")"

command -v xcodegen >/dev/null 2>&1 || {
  echo "未找到 xcodegen，请先安装：brew install xcodegen" >&2
  exit 1
}

echo "== 1/3 生成 Xcode 工程 =="
xcodegen generate

echo "== 2/3 编译（未签名，真机 arm64）=="
xcodebuild \
  -project HongguoDrama.xcodeproj \
  -scheme HongguoDrama \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  build

echo "== 3/3 打包 IPA =="
APP="$(find build/Build/Products/Release-iphoneos -maxdepth 1 -name '*.app' | head -n 1)"
if [ -z "$APP" ]; then
  echo "未找到编译产物 .app" >&2
  exit 1
fi
rm -rf Payload HongguoDrama-unsigned.ipa
mkdir -p Payload
cp -R "$APP" Payload/
zip -qry HongguoDrama-unsigned.ipa Payload
rm -rf Payload

echo "完成：$(pwd)/HongguoDrama-unsigned.ipa"
