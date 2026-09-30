package com.hydrogen.music;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * 返回键事件名：前端在 window 上监听 'hydrogen:backbutton'。
     */
    private static final String BACK_EVENT = "hydrogen:backbutton";

    /** 相邻两次返回的最小间隔，避免连按/手势抖动导致前端被连续触发。 */
    private long lastBackAt = 0L;
    private static final long BACK_THROTTLE_MS = 350L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 通知栏 / 锁屏的媒体控制，以及返回键处理所需的退出能力。
        // 必须写在 super.onCreate 之前，Capacitor 才会把它们挂到 bridge 上供前端调用。
        registerPlugin(MediaNotificationPlugin.class);
        registerPlugin(AppControlPlugin.class);
        registerPlugin(LocalMusicPlugin.class);
        registerPlugin(MusicDownloadPlugin.class);
        super.onCreate(savedInstanceState);

        // 移动端统一适配（与 index.html 的 viewport=width:390 配合）：
        // 1) textZoom=100：系统字体缩放不再放大页面文字（与 mobile.css 的 text-size-adjust 双保险）；
        // 2) useWideViewPort + loadWithOverviewMode：让 WebView 尊重
        //    <meta name="viewport" content="width=390">，把布局视口固定为设计宽 390，
        //    再按屏幕宽等比缩放 —— 所有机型渲染同一套已校准布局，根治跨机型显示差异；
        // 3) 关闭双指缩放与缩放控件：避免误触缩放把布局拉乱。
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebSettings ws = getBridge().getWebView().getSettings();
                ws.setTextZoom(100);
                ws.setUseWideViewPort(true);
                ws.setLoadWithOverviewMode(true);
                ws.setSupportZoom(false);
                ws.setBuiltInZoomControls(false);
                ws.setDisplayZoomControls(false);
            }
        } catch (Throwable ignored) {
        }

        registerBackHandler();
    }

    /**
     * 接管系统返回键 / 全面屏返回手势。
     *
     * 背景：Capacitor 的 BridgeActivity 完全没有注册任何返回回调，
     * 于是按返回走的是系统默认行为——finish() 当前 Activity，
     * 表现为「不管在哪个页面，按一下返回就退到桌面」。
     *
     * 为什么用 OnBackPressedDispatcher 而不是覆写 onBackPressed()：
     *   本 App 的 targetSdk 是 36（Android 16），而 onBackPressed() 这个旧 API
     *   在 Android 13+ 的预测式返回（predictive back）下会被绕过 ——
     *   实测覆写它完全收不到回调，返回键仍然直接退出。
     *   OnBackPressedDispatcher 是 AndroidX 的正式方案，返回键与返回手势都能覆盖。
     *
     * 这里只把事件派发给前端，由前端决定：
     *   · 全屏播放页打开 → 关闭播放页
     *   · 不在根路由     → router.back() 回上一级
     *   · 已在根路由     → 调 AppControl.exitApp() 才真正退出
     * 也就是说「是否退出」完全由前端判断，原生不会擅自 finish()，
     * 否则前端根本没有机会拦截。
     */
    private void registerBackHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                long now = System.currentTimeMillis();
                if (now - lastBackAt < BACK_THROTTLE_MS) {
                    return;
                }
                lastBackAt = now;
                dispatchBackToWeb();
            }
        });
    }

    /**
     * 直接注入脚本派发事件。
     *
     * 不用 Bridge.triggerWindowJSEvent：该 API 在 Capacitor 8 上不保证存在，
     * 一旦抛异常就会落到兜底分支把 Activity finish 掉，正好是要避免的行为。
     * evaluateJavascript 是 WebView 自身的稳定 API，最可靠。
     */
    private void dispatchBackToWeb() {
        WebView webView = null;
        try {
            if (getBridge() != null) {
                webView = getBridge().getWebView();
            }
        } catch (Throwable ignored) {
            webView = null;
        }

        if (webView == null) {
            // bridge 还没建好（极早期）。此时也**不要** finish ——
            // 宁可这一次返回无响应，也不要误退出 App。
            return;
        }

        final String js =
            "(function(){"
                + "try{"
                + "window.dispatchEvent(new CustomEvent('" + BACK_EVENT + "'));"
                + "}catch(err){"
                + "try{var ev=document.createEvent('Event');"
                + "ev.initEvent('" + BACK_EVENT + "',true,true);"
                + "window.dispatchEvent(ev);}catch(e2){}"
                + "}"
                + "})()";
        try {
            webView.evaluateJavascript(js, null);
        } catch (Throwable ignored) {
            // 注入失败同样不 finish
        }
    }
}
