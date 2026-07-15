package com.muralquest.stpete;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // The app uses the web Geolocation API (navigator.geolocation) in the WebView
    // for tour navigation + the compass. Android WebView geolocation only works once
    // the app itself holds the runtime location permission — request it on launch so
    // Capacitor's WebChromeClient grants the WebView's geolocation prompt.
    // v1 tours are screen-on only; no background/foreground-service location.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
    }
}
