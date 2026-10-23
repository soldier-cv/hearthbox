package app.hearthbox;

import android.graphics.Color;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * TV 壳只做三件事：全屏、常亮、把遥控器/手柄按键交给 WebView。
 *
 * 平台逻辑全在 apps/shell。origin 固定为 https://localhost（capacitor.config.json
 * 的 androidScheme），与 docs/decisions.md D3 一致：换 scheme 等于换域名，
 * IndexedDB 里的存档和已安装游戏会全部丢失。
 */
public class MainActivity extends BridgeActivity {
    private static final int BACKGROUND = Color.parseColor("#110E0C");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();

        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView != null) {
            webView.setBackgroundColor(BACKGROUND);
            webView.setFocusable(true);
            webView.requestFocus();
        }

        // 遥控器返回键先交给页面历史；货架上再按一次才退出。
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView current = bridge == null ? null : bridge.getWebView();
                if (current != null && current.canGoBack()) {
                    current.goBack();
                } else {
                    finish();
                }
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
