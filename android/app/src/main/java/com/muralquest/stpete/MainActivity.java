package com.muralquest.stpete;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // The app uses the web Geolocation API (navigator.geolocation) in the WebView
        // for tour navigation + the compass. Android WebView geolocation only works once
        // the app itself holds the runtime location permission — request it on launch so
        // Capacitor's WebChromeClient grants the WebView's geolocation prompt.
        // v1 tours are screen-on only; no background/foreground-service location.
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                },
                1001
            );
        }

        // Safe-area insets. Android 15+/16 force edge-to-edge (the WebView draws under
        // the status + navigation bars), and unlike iOS WKWebView, Android WebView does
        // NOT populate CSS env(safe-area-inset-*) — so the app's fixed top header and
        // bottom tab bar would sit under the system bars. Read the real system-bar insets
        // and push them into the same --safe-top/--safe-bottom CSS vars the layout already
        // uses (css/app.css). Re-applied on every insets change (rotation, nav-mode switch,
        // keyboard). iOS is unaffected — this native code never runs there, so env() stands.
        final WebView webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            float d = getResources().getDisplayMetrics().density;
            String js =
                "(function(){var s=document.documentElement.style;" +
                "s.setProperty('--safe-top','" + Math.round(bars.top / d) + "px');" +
                "s.setProperty('--safe-bottom','" + Math.round(bars.bottom / d) + "px');" +
                "s.setProperty('--safe-left','" + Math.round(bars.left / d) + "px');" +
                "s.setProperty('--safe-right','" + Math.round(bars.right / d) + "px');})();";
            webView.post(() -> webView.evaluateJavascript(js, null));
            return insets;
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
