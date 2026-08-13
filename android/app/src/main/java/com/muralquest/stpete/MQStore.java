package com.muralquest.stpete;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import java.util.ArrayList;
import java.util.List;

/**
 * MQStore — native Google Play Billing plugin, the Android twin of the iOS StoreKit
 * MQStore (ios/App/App/AppDelegate.swift). Powers the $6.99/year auto-renewing
 * subscription `mq_yearly`. Called from JS via Capacitor.nativePromise('MQStore', …)
 * — see js/subscription.js. Returns the SAME shape the shared computeAccess() expects
 * ({active, expirationMs}); the iOS grandfather fields (originalPurchaseMs, environment)
 * are simply absent on Android, so that branch is naturally skipped — there are no
 * legacy Android buyers to grandfather.
 *
 * NOTE: client-side Play Billing exposes no exact expiry date, so access = "an active,
 * acknowledged mq_yearly purchase is present"; expirationMs is 0. Play manages renewal.
 *
 * Fail-open: if the billing connection can't be established, checkAccess REJECTS so the
 * JS gate fails open (never lock out over a transient/unavailable store), mirroring iOS.
 */
@CapacitorPlugin(name = "MQStore")
public class MQStore extends Plugin {

    private static final String PRODUCT_ID = "mq_yearly";

    private BillingClient billingClient;
    // The purchase flow completes asynchronously via the listener, not the launch call,
    // so we hold the in-flight PluginCall here and resolve it when the listener fires.
    private PluginCall pendingPurchaseCall;

    private final PurchasesUpdatedListener purchasesUpdatedListener =
        (BillingResult result, List<Purchase> purchases) -> {
            int code = result.getResponseCode();
            if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
                for (Purchase p : purchases) acknowledgeIfNeeded(p);
                resolvePurchase(new JSObject().put("purchased", true));
            } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
                resolvePurchase(new JSObject().put("cancelled", true));
            } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
                // Already subscribed (e.g. re-tap) — treat as success; checkAccess confirms.
                resolvePurchase(new JSObject().put("purchased", true));
            } else {
                rejectPurchase("purchase failed: code " + code + " " + result.getDebugMessage());
            }
        };

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(purchasesUpdatedListener)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().build())
            .build();
        // Warm the connection; individual calls reconnect if it dropped.
        connect(null, null);
    }

    /**
     * Ensure the client is connected, then run onReady. If the connection can't be
     * established, run onError (callers reject/resolve their PluginCall there so no
     * JS promise hangs).
     */
    private void connect(final Runnable onReady, final Runnable onError) {
        if (billingClient.isReady()) {
            if (onReady != null) onReady.run();
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    if (onReady != null) onReady.run();
                } else if (onError != null) {
                    onError.run();
                }
            }
            @Override
            public void onBillingServiceDisconnected() { /* reconnect lazily on next call */ }
        });
    }

    // ---- Access ----------------------------------------------------------------

    private void queryAccess(final PluginCall call) {
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS).build(),
            (BillingResult result, List<Purchase> purchases) -> {
                boolean active = false;
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK
                    && purchases != null) {
                    for (Purchase p : purchases) {
                        if (p.getProducts().contains(PRODUCT_ID)
                            && p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                            active = true;
                            acknowledgeIfNeeded(p);
                        }
                    }
                }
                JSObject ret = new JSObject();
                ret.put("active", active);
                ret.put("expirationMs", 0); // not available client-side; Play auto-renews
                call.resolve(ret);
            });
    }

    @PluginMethod
    public void checkAccess(final PluginCall call) {
        // On connection failure, REJECT → subscription.js sets _determined=false and the
        // paywall fails open (don't lock anyone out over an unreachable store).
        connect(() -> queryAccess(call), () -> call.reject("Billing unavailable"));
    }

    /** Restore = re-query owned subs. Play auto-restores entitlements; no sync call needed. */
    @PluginMethod
    public void restore(final PluginCall call) {
        connect(() -> queryAccess(call), () -> call.reject("Billing unavailable"));
    }

    // ---- Product / price -------------------------------------------------------

    @PluginMethod
    public void getProduct(final PluginCall call) {
        connect(() -> queryProductDetails(pd -> {
            String price = "";
            if (pd != null && pd.getSubscriptionOfferDetails() != null
                && !pd.getSubscriptionOfferDetails().isEmpty()) {
                List<ProductDetails.PricingPhase> phases =
                    pd.getSubscriptionOfferDetails().get(0).getPricingPhases().getPricingPhaseList();
                if (!phases.isEmpty()) price = phases.get(0).getFormattedPrice();
            }
            call.resolve(new JSObject().put("priceString", price));
        }), () -> call.resolve(new JSObject().put("priceString", ""))); // empty → JS uses default label
    }

    // ---- Purchase --------------------------------------------------------------

    @PluginMethod
    public void purchase(final PluginCall call) {
        pendingPurchaseCall = call;
        connect(() -> queryProductDetails(pd -> {
            if (pd == null || pd.getSubscriptionOfferDetails() == null
                || pd.getSubscriptionOfferDetails().isEmpty()) {
                rejectPurchase("Product mq_yearly not found");
                return;
            }
            String offerToken = pd.getSubscriptionOfferDetails().get(0).getOfferToken();
            List<BillingFlowParams.ProductDetailsParams> params = new ArrayList<>();
            params.add(BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(pd)
                .setOfferToken(offerToken)
                .build());
            BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(params)
                .build();
            getActivity().runOnUiThread(() ->
                billingClient.launchBillingFlow(getActivity(), flowParams));
            // Resolution comes via purchasesUpdatedListener.
        }), () -> rejectPurchase("Billing unavailable"));
    }

    // ---- helpers ---------------------------------------------------------------

    private interface ProductCallback { void run(ProductDetails pd); }

    private void queryProductDetails(final ProductCallback cb) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        products.add(QueryProductDetailsParams.Product.newBuilder()
            .setProductId(PRODUCT_ID)
            .setProductType(BillingClient.ProductType.SUBS)
            .build());
        billingClient.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(products).build(),
            (BillingResult result, List<ProductDetails> list) -> {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK
                    && list != null && !list.isEmpty()) {
                    cb.run(list.get(0));
                } else {
                    cb.run(null);
                }
            });
    }

    private void acknowledgeIfNeeded(Purchase p) {
        if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED && !p.isAcknowledged()) {
            billingClient.acknowledgePurchase(
                AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(p.getPurchaseToken()).build(),
                (BillingResult r) -> { /* best-effort; renewals re-notify if it fails */ });
        }
    }

    private void resolvePurchase(JSObject ret) {
        if (pendingPurchaseCall != null) { pendingPurchaseCall.resolve(ret); pendingPurchaseCall = null; }
    }

    private void rejectPurchase(String msg) {
        if (pendingPurchaseCall != null) { pendingPurchaseCall.reject(msg); pendingPurchaseCall = null; }
    }
}
