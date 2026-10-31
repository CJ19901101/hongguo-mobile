import Foundation

/// 服务地址解析：用户可能只输入 IP，也可能输入完整 URL
enum AppConfig {
    static let defaultPort = 8787
    static let storageKey = "serverAddress"
    static let hint = "例如 192.168.1.5:8787"

    /// 把 "192.168.1.5" / "192.168.1.5:8787" / "http://host:8787/" 统一成可加载的 URL
    static func normalize(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }

        let lower = text.lowercased()
        if !lower.hasPrefix("http://") && !lower.hasPrefix("https://") {
            text = "http://" + text
        }

        guard var components = URLComponents(string: text),
              let host = components.host,
              !host.isEmpty else {
            return nil
        }
        if components.port == nil {
            components.port = defaultPort
        }
        components.path = "/"
        components.query = nil
        components.fragment = nil
        return components.url
    }

    /// 提示用户"当前连的是哪个地址"，用于设置页展示
    static func display(_ url: URL) -> String {
        url.absoluteString
    }
}
