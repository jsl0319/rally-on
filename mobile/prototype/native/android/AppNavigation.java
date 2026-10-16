package dev.rallyon.prototype;

import java.net.URI;
import java.util.Arrays;
import java.util.List;

final class AppNavigation {
    private static final List<String> AUTH_HOSTS = Arrays.asList("kauth.kakao.com", "accounts.kakao.com");

    static boolean allowsHistoryDestination(String targetUrl, String sourceUrl, String serverUrl) {
        try {
            URI target = URI.create(targetUrl);
            URI source = URI.create(sourceUrl);
            URI server = URI.create(serverUrl);
            if (target.getRawUserInfo() != null || source.getRawUserInfo() != null) return false;
            boolean sourceApp = sameOrigin(source, server);
            boolean targetApp = sameOrigin(target, server);
            // Legal pages opened before sign-in must return to the login entry.
            if (sourceApp && ("/terms".equals(source.getPath()) || "/privacy".equals(source.getPath())) &&
                    targetApp && "/login".equals(target.getPath())) return true;
            if (sourceApp && servicePath(source.getPath())) {
                return targetApp && servicePath(target.getPath());
            }
            // OAuth cancellation can revisit sign-in, but never a pre-logout service page.
            return (authUrl(source, server) && authUrl(target, server));
        } catch (IllegalArgumentException | NullPointerException error) {
            return false;
        }
    }

    private static boolean servicePath(String path) {
        return path != null && !path.equals("/login") && !path.equals("/login/") &&
            !path.equals("/api") && !path.startsWith("/api/") &&
            !path.startsWith("/my/notifications/open/");
    }

    private static boolean authUrl(URI url, URI server) {
        if (sameOrigin(url, server)) return !servicePath(url.getPath()) &&
            !url.getPath().startsWith("/my/notifications/open/");
        return "https".equals(url.getScheme()) && (url.getPort() == -1 || url.getPort() == 443) &&
            AUTH_HOSTS.contains(url.getHost());
    }

    private static boolean sameOrigin(URI url, URI server) {
        return server.getScheme() != null && server.getHost() != null &&
            server.getScheme().equals(url.getScheme()) && server.getHost().equalsIgnoreCase(url.getHost()) &&
            port(server) == port(url);
    }

    private static int port(URI url) {
        if (url.getPort() != -1) return url.getPort();
        return "https".equals(url.getScheme()) ? 443 : 80;
    }
}
