package com.hydrogen.music;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 极小的应用控制插件，目前只提供退出 App。
 *
 * 为什么需要它：
 *   本项目没装 @capacitor/app（也没有跑 cap sync，加官方插件成本高），
 *   而 Capacitor 8 并没有暴露一个可靠的"退出应用"接口
 *   （类型定义里的 navigator.app.exitApp 是 Cordova 遗留，不保证可用）。
 *   返回键的处理策略是「前端决定是否退出」，所以前端必须有个办法真正退出。
 *
 * JS 侧调用：AppControl.exitApp()
 */
@CapacitorPlugin(name = "AppControl")
public class AppControlPlugin extends Plugin {

    @PluginMethod
    public void exitApp(PluginCall call) {
        call.resolve();
        // 在 UI 线程结束当前 Activity，等同用户主动关闭 App
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().finishAndRemoveTask();
            } catch (Throwable ignored) {
                getActivity().finish();
            }
        });
    }
}
