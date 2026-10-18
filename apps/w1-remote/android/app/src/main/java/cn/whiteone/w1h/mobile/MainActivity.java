package cn.whiteone.w1h.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.webkit.JsResult;
import android.app.AlertDialog;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.View;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import org.json.JSONObject;
import java.security.KeyStore;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Local-only WebView UI. Pairing keys and drafts are encrypted with Android Keystore. */
public class MainActivity extends Activity {
    private WebView web;
    private SecretKey storageKey;
    private SharedPreferences store;
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
            String alias = "w1h-remote-storage-v1";
            if (!keys.containsAlias(alias)) {
                KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
                generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
                generator.generateKey();
            }
            storageKey = (SecretKey) keys.getKey(alias, null);
        } catch (Exception error) { new AlertDialog.Builder(this).setMessage("无法打开设备安全存储，请重启应用。").setPositiveButton("关闭", (d,w)->finish()).show(); return; }
        store = getSharedPreferences("w1h-remote", MODE_PRIVATE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        FrameLayout root = new FrameLayout(this); root.setFitsSystemWindows(true); root.setBackgroundColor(Color.rgb(245,246,247));
        web = new WebView(this); root.addView(web); setContentView(root);
        root.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});
        WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(false);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl(); if (uri.getHost()!=null && uri.getHost().equals("appassets.androidplatform.net")) return assets.shouldInterceptRequest(uri);
                return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",null,null);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return true;}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsConfirm(WebView view,String url,String message,JsResult result){
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确认",(d,w)->result.confirm()).setNegativeButton("取消",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "W1Native");
        web.loadUrl(ORIGIN + "/assets/index.html");
    }
    private class Bridge {
        @JavascriptInterface public String deviceName(){return Build.MANUFACTURER+" "+Build.MODEL;}
        @JavascriptInterface public void scan(){runOnUiThread(()->new IntentIntegrator(MainActivity.this).setDesiredBarcodeFormats(IntentIntegrator.QR_CODE).setPrompt("扫描电脑 W1 的配对二维码").setBeepEnabled(false).setOrientationLocked(false).initiateScan());}
        @JavascriptInterface public synchronized void save(String key,String value){
            if(key==null||!key.matches("[A-Za-z0-9_-]{1,200}")||value==null||value.length()>200000)throw new IllegalArgumentException("Invalid storage value");
            try{Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,storageKey);byte[] data=cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));byte[] result=new byte[12+data.length];System.arraycopy(cipher.getIV(),0,result,0,12);System.arraycopy(data,0,result,12,data.length);if(!store.edit().putString(key,Base64.encodeToString(result,Base64.NO_WRAP)).commit())throw new IllegalStateException("Storage failed");}
            catch(Exception error){throw new IllegalStateException("无法保存本机数据");}
        }
        @JavascriptInterface public synchronized String load(String key){
            if(key==null||!key.matches("[A-Za-z0-9_-]{1,200}"))return "null";
            String value=store.getString(key,null);if(value==null)return "null";
            try{byte[] data=Base64.decode(value,Base64.NO_WRAP);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,storageKey,new GCMParameterSpec(128,Arrays.copyOfRange(data,0,12)));return new String(cipher.doFinal(Arrays.copyOfRange(data,12,data.length)),StandardCharsets.UTF_8);}
            catch(Exception error){return "null";}
        }
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        IntentResult result=IntentIntegrator.parseActivityResult(requestCode,resultCode,data);
        if(result!=null){if(result.getContents()!=null)web.evaluateJavascript("window.w1ScanResult("+JSONObject.quote(result.getContents())+")",null);return;}
        super.onActivityResult(requestCode,resultCode,data);
    }
    @Override public void onBackPressed(){if(web!=null)web.evaluateJavascript("document.getElementById('back').click()",null);else super.onBackPressed();}
    @Override protected void onDestroy(){if(web!=null){web.removeJavascriptInterface("W1Native");web.destroy();}super.onDestroy();}
}
