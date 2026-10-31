import SwiftUI

struct RootView: View {
    @AppStorage(AppConfig.storageKey) private var savedAddress: String = ""
    @State private var editing = false
    @State private var reloadID = 0
    @State private var failureMessage: String?

    private var baseURL: URL? {
        AppConfig.normalize(savedAddress)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let url = baseURL, !editing {
                WebView(
                    url: url,
                    reloadID: reloadID,
                    onFinish: { failureMessage = nil },
                    onFail: { message in failureMessage = message }
                )
                .overlay(alignment: .topLeading) { settingsHotspot }
                .ignoresSafeArea()

                if let message = failureMessage {
                    FailureView(
                        message: message,
                        address: AppConfig.display(url),
                        onRetry: {
                            failureMessage = nil
                            reloadID += 1
                        },
                        onEdit: { editing = true }
                    )
                }
            } else {
                SetupView(
                    initial: savedAddress,
                    canCancel: !savedAddress.isEmpty,
                    onSave: { address in
                        savedAddress = address
                        failureMessage = nil
                        editing = false
                        reloadID += 1
                    },
                    onCancel: { editing = false }
                )
            }
        }
    }

    /// 顶部状态栏条内的透明热区（左上偏右，避开播放页返回按钮），长按 1 秒进入设置
    private var settingsHotspot: some View {
        Rectangle()
            .fill(Color.white.opacity(0.001))
            .frame(width: 56, height: 40)
            .contentShape(Rectangle())
            .padding(.leading, 64)
            .onLongPressGesture(minimumDuration: 1.0) {
                editing = true
            }
    }
}

struct SetupView: View {
    let initial: String
    let canCancel: Bool
    let onSave: (String) -> Void
    let onCancel: () -> Void

    @State private var text: String = ""
    @State private var errorText: String?
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 60)

            HStack(spacing: 10) {
                Image(systemName: "play.tv.fill")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(Color(red: 1.0, green: 0.35, blue: 0.28))
                Text("红果短剧")
                    .font(.system(size: 26, weight: .heavy))
                    .foregroundStyle(.white)
            }

            Text("连接到电脑上运行的服务")
                .font(.system(size: 15))
                .foregroundStyle(.white.opacity(0.55))
                .padding(.top, 6)

            TextField("服务地址", text: $text)
                .textFieldStyle(.plain)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focused)
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .frame(height: 50)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color.white.opacity(0.08))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.white.opacity(0.14), lineWidth: 1)
                )
                .padding(.top, 26)

            if let errorText = errorText {
                Text(errorText)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(red: 1.0, green: 0.42, blue: 0.38))
                    .padding(.top, 8)
            }

            Button(action: submit) {
                Text("连接")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(LinearGradient(
                                gradient: Gradient(colors: [
                                    Color(red: 1.0, green: 0.36, blue: 0.27),
                                    Color(red: 1.0, green: 0.22, blue: 0.42),
                                ]),
                                startPoint: .leading,
                                endPoint: .trailing
                            ))
                    )
            }
            .padding(.top, 14)

            if canCancel {
                Button(action: onCancel) {
                    Text("返回播放")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.white.opacity(0.6))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .padding(.top, 4)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("怎么填").font(.system(size: 13, weight: .bold)).foregroundStyle(.white.opacity(0.75))
                Text("1. 电脑上运行 start.bat（或 npm start），窗口会打印 http://192.168.x.x:8787")
                Text("2. 把那个地址填到上面，手机与电脑连同一个 Wi-Fi")
                Text("3. 电脑换了网络/重开机导致 IP 变化时，长按画面左上角 1 秒改地址")
            }
            .font(.system(size: 12.5))
            .foregroundStyle(.white.opacity(0.45))
            .lineSpacing(3)
            .padding(.top, 22)

            Spacer()
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.043, green: 0.043, blue: 0.063).ignoresSafeArea())
        .onAppear {
            if text.isEmpty { text = initial }
            if initial.isEmpty { focused = true }
        }
    }

    private func submit() {
        guard AppConfig.normalize(text) != nil else {
            errorText = "地址格式不对，试试 \(AppConfig.hint)"
            return
        }
        errorText = nil
        focused = false
        onSave(text.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}

struct FailureView: View {
    let message: String
    let address: String
    let onRetry: () -> Void
    let onEdit: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(Color(red: 1.0, green: 0.45, blue: 0.38))

            Text("连不上服务")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.white)

            Text("请确认电脑上的服务已启动，手机与电脑在同一 Wi-Fi。\n当前地址：\(address)")
                .font(.system(size: 13))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.55))

            Text(message)
                .font(.system(size: 11))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.3))
                .lineLimit(3)

            HStack(spacing: 12) {
                Button(action: onRetry) {
                    Text("重试")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 110, height: 44)
                        .background(RoundedRectangle(cornerRadius: 11).fill(Color.white.opacity(0.14)))
                }
                Button(action: onEdit) {
                    Text("改地址")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 110, height: 44)
                        .background(RoundedRectangle(cornerRadius: 11).fill(Color.white.opacity(0.14)))
                }
            }
            .padding(.top, 6)
        }
        .padding(26)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(red: 0.09, green: 0.09, blue: 0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.white.opacity(0.1), lineWidth: 1)
        )
        .padding(28)
    }
}
