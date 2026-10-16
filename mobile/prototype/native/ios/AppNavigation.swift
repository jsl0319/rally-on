import Foundation

enum AppNavigation {
    static func allowsHistoryDestination(_ target: URL, from source: URL?, server: URL) -> Bool {
        // Keep the existing OAuth cancellation flow. This guard only applies
        // when leaving a service screen, not while moving through sign-in.
        guard let source, source.scheme == server.scheme, source.host == server.host,
              source.port == server.port, source.path != "/login",
              !source.path.hasPrefix("/api/") else { return true }
        guard target.scheme == server.scheme, target.host == server.host,
              target.port == server.port, target.user == nil, target.password == nil else { return false }
        return target.path != "/login" && !target.path.hasPrefix("/api/")
    }
}
