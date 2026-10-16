package dev.rallyon.prototype;

import android.os.Bundle;
import android.webkit.WebBackForwardList;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = bridge == null ? null : bridge.getWebView();
                if (web != null && web.canGoBack()) {
                    WebBackForwardList history = web.copyBackForwardList();
                    int current = history.getCurrentIndex();
                    if (current > 0 && AppNavigation.allowsHistoryDestination(
                            history.getItemAtIndex(current - 1).getUrl(), web.getUrl(),
                            bridge.getConfig().getServerUrl())) {
                        web.goBack();
                        return;
                    }
                }
                // At the app entry, leave the task without revisiting sign-in or an old account.
                moveTaskToBack(true);
            }
        });
    }
}
