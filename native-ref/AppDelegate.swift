import UIKit
import Capacitor
import StoreKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Note: narration audio plays via the Web Audio API (app.js), which routes to the
        // speaker on its own — no AVAudioSession config needed. An earlier .playback+setActive
        // experiment here was removed: it wasn't necessary and interfered with CHHapticEngine
        // haptics. (If silent-switch / background playback for pocketed-phone tours ever needs
        // a session category, add it in a way that doesn't disrupt haptics.)
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// MARK: - AppRating plugin
// Local Capacitor plugin: asks iOS to present the native App Store review
// sheet. Called from JS via Capacitor.nativePromise('AppRating','requestReview',{}).
// It lives in this already-compiled file so Capacitor auto-registers it at
// runtime (via CAPBridgedPlugin) without needing separate target membership.
// iOS decides whether to actually show the sheet (throttled ≤3/user/year);
// the JS side (maybeRequestReview in app.js) ensures we only ask once.
@objc(AppRating)
public class AppRating: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppRating"
    public let jsName = "AppRating"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise)
    ]

    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
            else {
                call.resolve(["requested": false])
                return
            }
            if #available(iOS 16.0, *) {
                AppStore.requestReview(in: scene)
            } else {
                SKStoreReviewController.requestReview(in: scene)
            }
            call.resolve(["requested": true])
        }
    }
}

// MARK: - MQStore plugin (native StoreKit 2 subscription)
// Local Capacitor plugin for the $6.99/year auto-renewable subscription
// `mq_yearly`. StoreKit 2 verifies entitlements on-device — no server, no third
// party (we tore out RevenueCat). Called from JS via
// Capacitor.nativePromise('MQStore', …) — see js/subscription.js. Auto-registers
// via CAPBridgedPlugin, same as AppRating above. Grandfathering reads
// AppTransaction.originalAppVersion. Comps are done with App Store Offer Codes,
// which show up here as an active entitlement.
@objc(MQStore)
public class MQStore: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MQStore"
    public let jsName = "MQStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise)
    ]

    private let productID = "mq_yearly"

    // Finish transactions that arrive outside the purchase flow (renewals,
    // Ask-to-Buy approvals, Offer Code redemptions) so they don't get stuck.
    override public func load() {
        if #available(iOS 15.0, *) {
            Task.detached {
                for await update in Transaction.updates {
                    if case .verified(let transaction) = update {
                        await transaction.finish()
                    }
                }
            }
        }
    }

    @available(iOS 15.0, *)
    private func accessInfo() async -> [String: Any] {
        var active = false
        var expirationMs: Double = 0
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            guard transaction.productID == productID, transaction.revocationDate == nil else { continue }
            if let exp = transaction.expirationDate {
                if exp > Date() {
                    active = true
                    expirationMs = max(expirationMs, exp.timeIntervalSince1970 * 1000)
                }
            } else {
                active = true
            }
        }
        var originalAppVersion = ""
        if #available(iOS 16.0, *) {
            if let verification = try? await AppTransaction.shared,
               case .verified(let appTx) = verification {
                originalAppVersion = appTx.originalAppVersion
            }
        }
        return ["active": active, "expirationMs": expirationMs, "originalAppVersion": originalAppVersion]
    }

    @objc func checkAccess(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.resolve(["active": false, "originalAppVersion": ""]); return }
        Task { call.resolve(await accessInfo()) }
    }

    @objc func getProduct(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.resolve(["priceString": ""]); return }
        Task {
            do {
                let products = try await Product.products(for: [productID])
                call.resolve(["priceString": products.first?.displayPrice ?? ""])
            } catch {
                call.reject("products failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("StoreKit 2 requires iOS 15+"); return }
        Task {
            do {
                let products = try await Product.products(for: [productID])
                guard let product = products.first else { call.reject("Product mq_yearly not found"); return }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    if case .verified(let transaction) = verification {
                        await transaction.finish()
                        call.resolve(["purchased": true])
                    } else {
                        call.reject("Purchase could not be verified")
                    }
                case .userCancelled:
                    call.resolve(["cancelled": true])
                case .pending:
                    call.resolve(["pending": true])
                @unknown default:
                    call.resolve(["purchased": false])
                }
            } catch {
                call.reject("purchase failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.resolve(["active": false, "originalAppVersion": ""]); return }
        Task {
            try? await AppStore.sync()
            call.resolve(await accessInfo())
        }
    }
}
