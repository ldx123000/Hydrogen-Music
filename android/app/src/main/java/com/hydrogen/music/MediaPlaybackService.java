package com.hydrogen.music;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

/**
 * 媒体播放前台服务。
 *
 * 为什么需要它：只用 NotificationManager.notify 发通知的话，App 一退到后台，
 * 系统就可能回收进程，通知连同播放一起被掐掉——用户在通知栏按了也没反应。
 * 用前台服务（foregroundServiceType=mediaPlayback）把通知挂住，
 * 系统才会按"正在播放"对待，保持进程存活、媒体通知不被清理。
 *
 * 通知对象由 MediaNotificationPlugin 构建后放进静态字段（两者同进程），
 * 服务只负责把它交给 startForeground。
 */
public class MediaPlaybackService extends Service {

    /** 由 MediaNotificationPlugin 在每次刷新通知后写入 */
    static Notification currentNotification;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (currentNotification != null) {
                startForeground(MediaNotificationPlugin.NOTIFICATION_ID, currentNotification);
            }
        } catch (Throwable error) {
            System.err.println("[MediaPlaybackService] startForeground 失败: " + error.getMessage());
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /**
     * 服务销毁时必须显式摘掉前台通知。
     *
     * 实测：通知栏里的媒体卡片由前台服务"挂住"，只调
     * NotificationManager.cancel() 是清不掉的 —— 服务一旦被销毁，
     * 系统会拿 startForeground 注册的那条粘性通知把它顶回来，
     * 结果是清空播放列表后通知一直赖在通知栏上。
     * 这里用 STOP_FOREGROUND_REMOVE 明确要求随服务一起移除。
     */
    @Override
    public void onDestroy() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Throwable error) {
            System.err.println("[MediaPlaybackService] 摘除前台通知失败: " + error.getMessage());
        }
        super.onDestroy();
    }
}
