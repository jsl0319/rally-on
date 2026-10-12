import Foundation

// Pure URL conversion, also exercised on macOS without a phone or location access.
enum KakaoMapLinks {
    static func route(from webURL: URL) -> URL? {
        guard let input = URLComponents(url: webURL, resolvingAgainstBaseURL: false),
              input.scheme == "https", input.host == "map.kakao.com",
              input.port == nil || input.port == 443,
              input.user == nil, input.password == nil,
              input.query == nil, input.fragment == nil,
              input.percentEncodedPath.hasPrefix("/link/to/") else { return nil }
        let parts = input.percentEncodedPath.dropFirst("/link/to/".count)
            .split(separator: ",", omittingEmptySubsequences: false)
        guard parts.count == 3,
              let name = String(parts[0]).removingPercentEncoding, !name.isEmpty,
              let latitude = Double(parts[1]), latitude.isFinite, (-90...90).contains(latitude),
              let longitude = Double(parts[2]), longitude.isFinite, (-180...180).contains(longitude) else { return nil }
        var output = URLComponents()
        output.scheme = "kakaomap"
        output.host = "route"
        output.queryItems = [
            URLQueryItem(name: "ep", value: "\(latitude),\(longitude)"),
            URLQueryItem(name: "en", value: name),
            URLQueryItem(name: "by", value: "car")
        ]
        return output.url
    }
}
