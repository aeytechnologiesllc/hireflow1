import UIKit
import Capacitor

/// The HireFlow app's screen (the owner, 2026-11-04: "a mobile first AAA
/// app"). A swipe from the left edge goes back a page, the way Safari and
/// every iPhone app do: the staff site's pages are the web view's history,
/// so iOS's own back gesture walks it. The stock plugins (app, push, status
/// bar) are picked up through CapApp-SPM.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        webView?.allowsBackForwardNavigationGestures = true
        // The page draws its own top bar under the clock (safe-area padding),
        // so the web view runs edge to edge with no grey bounce behind it.
        webView?.scrollView.bounces = false
    }
}
