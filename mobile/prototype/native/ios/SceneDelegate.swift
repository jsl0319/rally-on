import UIKit
import WebKit
import Capacitor
import SafariServices

@objc(RallyMapNavigationPlugin)
class RallyMapNavigationPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "RallyMapNavigationPlugin"
    let jsName = "RallyMapNavigation"
    let pluginMethods: [CAPPluginMethod] = []

    override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard navigationAction.targetFrame?.isMainFrame != false,
              let webURL = navigationAction.request.url,
              let routeURL = KakaoMapLinks.route(from: webURL),
              let serverURL = bridge?.config.serverURL else { return nil }
        let origin = navigationAction.sourceFrame.securityOrigin
        guard origin.protocol == serverURL.scheme, origin.host == serverURL.host,
              origin.port == (serverURL.port ?? (serverURL.scheme == "https" ? 443 : 80)) ||
                (origin.port == 0 && serverURL.port == nil) else { return nil }
        guard webView?.window?.windowScene?.activationState == .foregroundActive else { return true }
        // Open the documented destination scheme directly, avoiding the web-to-app landing page.
        UIApplication.shared.open(routeURL, options: [:]) { [weak self] opened in
            guard !opened else { return }
            DispatchQueue.main.async {
                guard let presenter = self?.bridge?.viewController,
                      presenter.view.window != nil, presenter.presentedViewController == nil else { return }
                // Keep the HTTPS fallback in a browser view rather than repeating the universal-link handoff.
                presenter.present(SFSafariViewController(url: webURL), animated: true)
            }
        }
        return true
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var loadingObservation: NSKeyValueObservation?
    private var progressObservation: NSKeyValueObservation?
    private var timeout: DispatchWorkItem?
    private var loadingView: UIView?
    private weak var initialWebView: WKWebView?
    private let message = UILabel()
    private var shownAt = CACurrentMediaTime()
    private var revealing = false
    private var revealWork: DispatchWorkItem?
    private let retry = UIButton(type: .system)

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        // UIKit already creates the storyboard window. Do not create a second bridge/WebView.
        if window == nil {
            window = UIWindow(windowScene: windowScene)
            window?.rootViewController = CAPBridgeViewController()
        }
        window?.backgroundColor = UIColor(red: 0.88, green: 0.92, blue: 0.82, alpha: 1)
        window?.makeKeyAndVisible()
        if let controller = window?.rootViewController as? CAPBridgeViewController {
            controller.loadViewIfNeeded()
            showInitialLoading(for: controller)
        }
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    private func showInitialLoading(for controller: CAPBridgeViewController) {
        controller.bridge?.registerPluginInstance(RallyMapNavigationPlugin())
        guard let window, let webView = controller.webView else { return }
        initialWebView = webView
        let cover = RallyEntryBrandView()
        shownAt = CACurrentMediaTime()
        revealing = false
        cover.translatesAutoresizingMaskIntoConstraints = false
        window.addSubview(cover)
        loadingView = cover

        message.font = .preferredFont(forTextStyle: .body)
        message.adjustsFontForContentSizeCategory = true
        message.textColor = .secondaryLabel
        message.numberOfLines = 0
        message.textAlignment = .center
        retry.setTitle("다시 연결", for: .normal)
        retry.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        retry.addTarget(self, action: #selector(retryInitialLoad), for: .touchUpInside)
        retry.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        let stack = UIStackView(arrangedSubviews: [message, retry])
        stack.axis = .vertical
        stack.spacing = 20
        stack.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(stack)
        NSLayoutConstraint.activate([
            cover.leadingAnchor.constraint(equalTo: window.leadingAnchor),
            cover.trailingAnchor.constraint(equalTo: window.trailingAnchor),
            cover.topAnchor.constraint(equalTo: window.topAnchor),
            cover.bottomAnchor.constraint(equalTo: window.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: cover.safeAreaLayoutGuide.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: cover.safeAreaLayoutGuide.trailingAnchor, constant: -28),
            stack.bottomAnchor.constraint(equalTo: cover.safeAreaLayoutGuide.bottomAnchor, constant: -28)
        ])
        beginWaiting()
        loadingObservation = webView.observe(\.isLoading, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.finishInitialLoadIfReady() }
        }
        progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.finishInitialLoadIfReady() }
        }
        finishInitialLoadIfReady()
    }

    private func beginWaiting() {
        timeout?.cancel()
        message.text = nil
        message.isHidden = true
        retry.isHidden = true
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.loadingView != nil else { return }
            self.message.isHidden = false
            self.message.text = "연결이 지연되고 있어요.\n인터넷 연결을 확인한 뒤 다시 시도해 주세요."
            self.retry.isHidden = false
            UIAccessibility.post(notification: .layoutChanged, argument: self.message)
        }
        timeout = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: work)
    }

    private func finishInitialLoadIfReady() {
        guard !revealing, let cover = loadingView, let webView = initialWebView,
              !webView.isLoading, webView.estimatedProgress >= 1, let url = webView.url else { return }
        revealing = true
        let controller = window?.rootViewController as? CAPBridgeViewController
        let origin = controller?.bridge?.config.serverURL
        let trusted = origin?.scheme == url.scheme && origin?.host == url.host && origin?.port == url.port
        let reducedMotion = UIAccessibility.isReduceMotionEnabled
        // The brand is already visible while the network works; only very fast loads need a quiet beat.
        let delay = reducedMotion ? 0 : max(0, 0.65 - (CACurrentMediaTime() - shownAt))
        let work = DispatchWorkItem { [weak self, weak webView, weak cover] in
            guard let self, let webView, let cover,
                  self.loadingView === cover, self.initialWebView === webView else { return }
            let reveal = {
                guard self.loadingView === cover, self.initialWebView === webView else { return }
                self.timeout?.cancel()
                self.timeout = nil
                self.loadingObservation = nil
                self.progressObservation = nil
                UIView.animate(withDuration: reducedMotion ? 0 : 0.35, delay: 0, options: [.curveEaseOut]) {
                    cover.alpha = 0
                } completion: { _ in
                    // Only presentation state crosses this boundary, never credentials or navigation data.
                    if trusted {
                        webView.evaluateJavaScript("document.documentElement.dataset.rallyNativeReveal = 'ready'", completionHandler: nil)
                    }
                    guard self.loadingView === cover else { return }
                    cover.removeFromSuperview()
                    self.loadingView = nil
                    self.initialWebView = nil
                    self.revealWork = nil
                }
            }
            if trusted {
                // Restart the actions after the native fade, even if the web finished behind the cover.
                // A fallback prevents hidden actions if the app backgrounds during the crossfade.
                webView.callAsyncJavaScript("""
                    document.documentElement.dataset.rallyNativeReveal = 'pending';
                    setTimeout(() => { if (document.documentElement.dataset.rallyNativeReveal === 'pending') document.documentElement.dataset.rallyNativeReveal = 'ready'; }, 2500);
                    await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1000))]);
                    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                    return ['.rally-welcome-wordmark', '.rally-welcome-slogan', '.rally-welcome-purpose'].map(selector => {
                      const el = document.querySelector(selector);
                      if (!el) return null;
                      const r = el.getBoundingClientRect();
                      return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: el.clientWidth, height: el.clientHeight };
                    });
                    """, in: nil, in: .page) { result in
                        guard self.loadingView === cover else { return }
                        if !reducedMotion, let brand = cover as? RallyEntryBrandView,
                           case .success(let value) = result, let frames = value as? [[String: Double]], frames.count == 3 {
                            // Settle safe-area/font metrics before crossfading, so two logos never separate.
                            UIView.animate(withDuration: 0.25, delay: 0, options: [.curveEaseOut]) {
                                brand.alignIdentity(to: frames)
                            } completion: { _ in reveal() }
                        } else {
                            reveal()
                        }
                    }
            } else {
                reveal()
            }
        }
        revealWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    @objc private func retryInitialLoad() {
        // Only available before the first page is shown; never replay an OAuth callback or a transaction.
        guard loadingView != nil, let window else { return }
        timeout?.cancel()
        revealWork?.cancel()
        revealWork = nil
        loadingObservation = nil
        progressObservation = nil
        initialWebView?.stopLoading()
        loadingView?.removeFromSuperview()
        loadingView = nil
        // Cancellation callbacks from the old WebView must not replace the new request with its error page.
        let controller = CAPBridgeViewController()
        window.rootViewController = controller
        controller.loadViewIfNeeded()
        showInitialLoading(for: controller)
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        timeout?.cancel()
        revealWork?.cancel()
        revealWork = nil
        loadingObservation = nil
        progressObservation = nil
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Offline-safe brand cover. Its identity and reserved action space mirror the web entry layout.
private final class RallyEntryBrandView: UIView {
    private let gradient = CAGradientLayer()
    private let glow = CAGradientLayer()
    private let court = CAShapeLayer()
    private let identity = UIView()
    private let wordmark = UIImageView(image: UIImage(named: "RallyWordmark"))
    private let slogan = UILabel()
    private let purpose = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(red: 0.88, green: 0.92, blue: 0.82, alpha: 1)
        clipsToBounds = true
        gradient.colors = [color(0xdbe8d1).cgColor, color(0xe9f0df).cgColor, color(0xf1f4e7).cgColor]
        gradient.locations = [0, 0.55, 1]
        gradient.startPoint = CGPoint(x: 0.15, y: 0)
        gradient.endPoint = CGPoint(x: 0.85, y: 1)
        layer.addSublayer(gradient)
        glow.type = .radial
        glow.colors = [color(0xecf3ce).cgColor, color(0xecf3ce).withAlphaComponent(0).cgColor]
        glow.startPoint = CGPoint(x: 0.9, y: 0.1)
        glow.endPoint = CGPoint(x: 0, y: 0.8)
        layer.addSublayer(glow)
        court.fillColor = UIColor.clear.cgColor
        court.strokeColor = UIColor.white.withAlphaComponent(0.5).cgColor
        court.lineWidth = 2
        layer.addSublayer(court)
        addSubview(identity)
        identity.addSubview(wordmark)
        wordmark.contentMode = .scaleAspectFit
        wordmark.isAccessibilityElement = true
        wordmark.accessibilityLabel = "Rally On"
        slogan.text = "부담 없이, 함께 테니스"
        slogan.font = .systemFont(ofSize: 20, weight: .bold)
        slogan.textColor = color(0x202d27)
        purpose.text = "나와 비슷한 메이트를 만나요"
        purpose.font = .systemFont(ofSize: 14)
        purpose.textColor = color(0x5d6b62)
        [slogan, purpose].forEach { $0.textAlignment = .center; identity.addSubview($0) }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    private func color(_ rgb: Int) -> UIColor {
        UIColor(red: CGFloat((rgb >> 16) & 255) / 255, green: CGFloat((rgb >> 8) & 255) / 255,
                blue: CGFloat(rgb & 255) / 255, alpha: 1)
    }

    func alignIdentity(to frames: [[String: Double]]) {
        for (view, frame) in zip([wordmark, slogan, purpose] as [UIView], frames) {
            guard let x = frame["x"], let y = frame["y"], let width = frame["width"], let height = frame["height"] else { continue }
            if view === wordmark {
                view.bounds = CGRect(x: 0, y: 0, width: width, height: height)
            }
            // Native and web body fonts can have different glyph widths. Never clip the native copy.
            view.center = convert(CGPoint(x: x, y: y), to: identity)
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // Disable implicit layer movement: changing safe areas must never animate the court or logo.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let top = safeAreaInsets.top
        let content = CGRect(x: 0, y: top, width: bounds.width, height: bounds.height - top)
        gradient.frame = content
        glow.frame = content
        let courtPath = UIBezierPath(rect: CGRect(x: 20, y: 20, width: 400, height: 640))
        for line in [(70.0,20.0,70.0,660.0),(370,20,370,660),(20,340,420,340),(70,180,370,180),(70,500,370,500),(220,180,220,500)] {
            courtPath.move(to: CGPoint(x: line.0, y: line.1)); courtPath.addLine(to: CGPoint(x: line.2, y: line.3))
        }
        court.bounds = CGRect(x: 0, y: 0, width: 440, height: 680)
        court.position = CGPoint(x: bounds.midX - 65 + 235, y: top - 310 + 680 * 470 / 440 / 2)
        court.setAffineTransform(CGAffineTransform(rotationAngle: -.pi * 24 / 180).scaledBy(x: 470 / 440, y: 470 / 440))
        court.path = courtPath.cgPath
        let width = min(480, bounds.width) - 48
        let fontSize = min(72, max(52, bounds.width * 0.16))
        let markWidth = fontSize * 3.68469618
        let markHeight = fontSize * 1.15
        let groupHeight = markHeight + 24 + 28 + 8 + 24
        let identityHeight = max(220, content.height - 28 - max(24, safeAreaInsets.bottom) - 32 - 222)
        identity.frame = CGRect(x: (bounds.width - width) / 2, y: top + 28 + (identityHeight - groupHeight) / 2, width: width, height: groupHeight)
        wordmark.transform = .identity
        wordmark.frame = CGRect(x: (width - markWidth) / 2, y: 0, width: markWidth, height: markHeight)
        wordmark.transform = CGAffineTransform(rotationAngle: -.pi / 60)
        slogan.frame = CGRect(x: 0, y: markHeight + 24, width: width, height: 28)
        purpose.frame = CGRect(x: 0, y: markHeight + 60, width: width, height: 24)
        CATransaction.commit()
    }
}
