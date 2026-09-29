package com.hydrogen.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 安卓通知栏 / 锁屏的音乐控制。
 *
 * 为什么必须走原生：实测本机 Android 16 的 WebView **不提供** navigator.mediaSession、
 * MediaMetadata 与 Notification（全部 undefined），Web 标准这条路在 App 里是死的。
 *
 * 实现只用框架自带 API（Notification.MediaStyle + android.media.session.MediaSession），
 * 不引入 androidx.media 依赖，这样也不必动 cap sync 那套。
 *
 * JS 侧调用：MediaNotification.show({title,artist,album,coverUrl,playing})
 *           MediaNotification.setPlaying({playing}) / MediaNotification.hide()
 * 通知按钮点击后通过 notifyListeners("mediaAction", {action}) 回传给前端。
 */
@CapacitorPlugin(name = "MediaNotification")
public class MediaNotificationPlugin extends Plugin {

    private static final String CHANNEL_ID = "hydrogen_music_playback";
    static final int NOTIFICATION_ID = 8801;
    private static final String ACTION_PLAY = "com.hydrogen.music.MEDIA_PLAY";
    private static final String ACTION_PAUSE = "com.hydrogen.music.MEDIA_PAUSE";
    private static final String ACTION_NEXT = "com.hydrogen.music.MEDIA_NEXT";
    private static final String ACTION_PREV = "com.hydrogen.music.MEDIA_PREV";

    private MediaSession mediaSession;
    private BroadcastReceiver actionReceiver;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private Bitmap coverBitmap;
    private String coverUrlLoaded = "";

    private String title = "";
    private String artist = "";
    private String album = "";
    private String mediaId = "";
    private long durationMs = 0;
    private long positionMs = 0;
    /** 已写进 MediaSession metadata 的时长，用来避免每秒重建一次 metadata */
    private long metadataDurationMs = 0;
    private boolean playing = false;
    private boolean visible = false;

    @Override
    public void load() {
        try {
            Context context = getContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                mediaSession = new MediaSession(context, "HydrogenMusic");
                mediaSession.setCallback(new MediaSession.Callback() {
                    @Override
                    public void onPlay() {
                        emit("play");
                    }

                    @Override
                    public void onPause() {
                        emit("pause");
                    }

                    @Override
                    public void onSkipToNext() {
                        emit("next");
                    }

                    @Override
                    public void onSkipToPrevious() {
                        emit("previous");
                    }
                });
                mediaSession.setActive(true);
                // 必须声明这两组能力，系统才把媒体键/蓝牙按键转给我们，
                // 否则通知栏上按钮点了没反应。
                mediaSession.setFlags(
                        MediaSession.FLAG_HANDLES_MEDIA_BUTTONS
                                | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
            }
            registerActionReceiver(context);
        } catch (Throwable error) {
            // 通知栏属于锦上添花，绝不能让它的初始化把 App 拉崩
            System.err.println("[MediaNotification] 初始化失败: " + error.getMessage());
        }
    }

    private void registerActionReceiver(Context context) {
        try {
            actionReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context ctx, Intent intent) {
                    String action = intent == null ? null : intent.getAction();
                    if (ACTION_PLAY.equals(action)) emit("play");
                    else if (ACTION_PAUSE.equals(action)) emit("pause");
                    else if (ACTION_NEXT.equals(action)) emit("next");
                    else if (ACTION_PREV.equals(action)) emit("previous");
                }
            };
            IntentFilter filter = new IntentFilter();
            filter.addAction(ACTION_PLAY);
            filter.addAction(ACTION_PAUSE);
            filter.addAction(ACTION_NEXT);
            filter.addAction(ACTION_PREV);
            if (Build.VERSION.SDK_INT >= 33) {
                context.registerReceiver(actionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                context.registerReceiver(actionReceiver, filter);
            }
        } catch (Throwable error) {
            System.err.println("[MediaNotification] 注册媒体按键失败: " + error.getMessage());
        }
    }

    /**
     * 从调用参数里读一个整数。
     *
     * 为什么不用 call.getLong()：JS 的数字经 Capacitor 桥传过来是 Double，
     * getLong() 对 Double **不会做转换**，实测直接返回 null ——
     * 于是 show({duration: 211000}) 里的时长根本没进原生，
     * metadata 的 METADATA_KEY_DURATION 与 PlaybackState 全是 0，
     * 通知栏那张卡片就一直显示 00:00 - 00:00（用户实测反馈的根因）。
     * 这里按 Number 取，兼容 Integer/Double/String 三种到达形态。
     */
    private long readLong(PluginCall call, String key, long fallback) {
        try {
            Object raw = call.getData() == null ? null : call.getData().opt(key);
            if (raw == null) return fallback;
            if (raw instanceof Number) return ((Number) raw).longValue();
            return (long) Double.parseDouble(String.valueOf(raw));
        } catch (Throwable ignored) {
            return fallback;
        }
    }

    private void emit(String action) {
        try {
            System.out.println("[MediaNotification] 收到动作 -> " + action);
            JSObject data = new JSObject();
            data.put("action", action);
            // keepAlive=true：App 在后台时也要能把按键事件送回前端
            notifyListeners("mediaAction", data, true);
            System.out.println("[MediaNotification] 已回传前端: " + action);
        } catch (Throwable error) {
            System.err.println("[MediaNotification] 事件回传失败: " + error.getMessage());
        }
    }

    @PluginMethod
    public void show(PluginCall call) {
        try {
            title = call.getString("title", "");
            artist = call.getString("artist", "");
            album = call.getString("album", "");
            playing = Boolean.TRUE.equals(call.getBoolean("playing", Boolean.FALSE));
            // 曲目标识与时长：MIUI 的媒体卡片/灵动岛在 mediaId 为空、时长为 0 时
            // 渲染会出问题（实测抛 NPE 且按钮点不动），这里一并带上。
            String nextMediaId = call.getString("mediaId", "");
            if (nextMediaId != null && !nextMediaId.isEmpty() && !nextMediaId.equals(mediaId)) {
                // 换曲了：进度归零，避免系统控件沿用上一首的位置
                positionMs = 0;
                metadataDurationMs = 0;
                mediaId = nextMediaId;
            }
            long nextDuration = readLong(call, "duration", -1L);
            if (nextDuration > 0) durationMs = nextDuration;
            String nextCover = call.getString("coverUrl", "");
            if (nextCover == null) nextCover = "";
            if (!nextCover.isEmpty() && !nextCover.equals(coverUrlLoaded)) {
                coverUrlLoaded = nextCover;
                loadCover(nextCover);
            }
            visible = true;
            updateNotification();
            call.resolve();
        } catch (Throwable error) {
            call.reject("显示媒体通知失败: " + error.getMessage());
        }
    }

    @PluginMethod
    public void setPlaying(PluginCall call) {
        try {
            playing = Boolean.TRUE.equals(call.getBoolean("playing", Boolean.FALSE));
            if (visible) updateNotification();
            call.resolve();
        } catch (Throwable error) {
            call.reject("更新播放状态失败: " + error.getMessage());
        }
    }

    /**
     * 推送当前进度（毫秒）。
     *
     * 为什么需要：通知栏媒体卡片上的进度条与「当前时间 / 总时长」读的是
     * MediaSession 的 PlaybackState（position/speed）与 MediaMetadata 的
     * METADATA_KEY_DURATION。此前 JS 侧只在切歌时推过一次，且位置恒为
     * PLAYBACK_POSITION_UNKNOWN，系统拿不到有效位置就固定显示 00:00 - 00:00
     * （用户实测反馈）。这里由 JS 按秒级节流持续推送。
     *
     * 注意：时长只在**变化时**才重建 metadata —— metadata 里带位图，
     * 每秒重建一次纯属浪费，还可能让系统侧反复刷新封面。
     */
    @PluginMethod
    public void setProgress(PluginCall call) {
        try {
            long position = readLong(call, "position", 0L);
            long duration = readLong(call, "duration", -1L);
            if (position < 0) position = 0L;
            if (duration > 0) durationMs = duration;
            if (!visible || mediaSession == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
                call.resolve();
                return;
            }
            long dur = durationMs;
            long pos = Math.min(position, dur);
            long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                    | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
                    | PlaybackState.ACTION_SKIP_TO_PREVIOUS;
            mediaSession.setPlaybackState(new PlaybackState.Builder()
                    .setActions(actions)
                    .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                            pos, playing ? 1f : 0f)
                    .setBufferedPosition(dur)
                    .build());
            // 播放位置在 MediaSession 里按"毫秒"给；时长只在变化时重建 metadata
            if (dur > 0 && dur != metadataDurationMs) {
                MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                        .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                        .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                        .putString(MediaMetadata.METADATA_KEY_ALBUM, album)
                        .putString(MediaMetadata.METADATA_KEY_MEDIA_ID, mediaId)
                        .putLong(MediaMetadata.METADATA_KEY_DURATION, dur);
                Bitmap largeIcon = coverBitmap != null ? coverBitmap : appIconBitmap();
                if (largeIcon != null) {
                    metadata.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, largeIcon);
                    metadata.putBitmap(MediaMetadata.METADATA_KEY_ART, largeIcon);
                }
                mediaSession.setMetadata(metadata.build());
                metadataDurationMs = dur;
            }
            call.resolve();
        } catch (Throwable error) {
            call.reject("更新进度失败: " + error.getMessage());
        }
    }

    @PluginMethod
    public void hide(PluginCall call) {
        try {
            visible = false;
            NotificationManager manager = notificationManager();
            // 顺序很重要：前台服务只要还活着，系统就会用 startForeground 的粘性通知
            // 把 manager.cancel() 顶回去（实测 cancel 无效，通知一直赖在通知栏）。
            // 必须先摘掉"前台"状态再停服务，最后 cancel。
            try {
                Intent serviceIntent = new Intent(getContext(), MediaPlaybackService.class);
                getContext().stopService(serviceIntent);
            } catch (Throwable ignored) {}
            if (manager != null) manager.cancel(NOTIFICATION_ID);
            if (mediaSession != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                mediaSession.setPlaybackState(new PlaybackState.Builder()
                        .setState(PlaybackState.STATE_NONE, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 0f)
                        .build());
            }
            call.resolve();
        } catch (Throwable error) {
            call.reject("关闭媒体通知失败: " + error.getMessage());
        }
    }

    private NotificationManager notificationManager() {
        return (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private void loadCover(final String url) {
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(6000);
                connection.setReadTimeout(6000);
                connection.setInstanceFollowRedirects(true);
                try (InputStream input = connection.getInputStream()) {
                    Bitmap bitmap = BitmapFactory.decodeStream(input);
                    if (bitmap != null) {
                        coverBitmap = bitmap;
                        updateNotification();
                    }
                }
            } catch (Throwable error) {
                // 封面拉不到就退化成纯文字通知
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        Intent intent = new Intent(action);
        intent.setPackage(getContext().getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(getContext(), requestCode, intent, flags);
    }

    /**
     * 把应用图标绘成 Bitmap。
     *
     * 为什么需要：大图标只给"资源 id"的话，系统侧（尤其 MIUI 的媒体卡片/灵动岛）
     * 会拿到 Icon(typ=RESOURCE)，实测会抛
     * NullPointerException: null receiver @ MiuiIslandMediaControllerImpl.addDynamicIslandView，
     * 导致媒体卡片渲染残缺、按钮点不动。所以这里兜底成真正的位图。
     */
    private Bitmap appIconBitmap() {
        try {
            Drawable drawable = getContext().getPackageManager()
                    .getApplicationIcon(getContext().getApplicationInfo());
            int size = 256;
            Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            drawable.setBounds(0, 0, size, size);
            drawable.draw(canvas);
            return bitmap;
        } catch (Throwable error) {
            return null;
        }
    }

    private void updateNotification() {
        Context context = getContext();
        NotificationManager manager = notificationManager();
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "播放控制", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            channel.setSound(null, null);
            manager.createNotificationChannel(channel);
        }

        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        int contentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) contentFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = launch == null
                ? null
                : PendingIntent.getActivity(context, 0, launch, contentFlags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);

        builder.setSmallIcon(context.getApplicationInfo().icon)
                .setContentTitle(title.isEmpty() ? "Hydrogen Music" : title)
                .setContentText(artist)
                .setSubText(album)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setOngoing(playing);
        if (contentIntent != null) builder.setContentIntent(contentIntent);
        // 大图标必须是真正的 Bitmap：拿不到封面就用应用图标兜底。
        // 只给资源 id 的话 MIUI 的媒体卡片会崩（见 appIconBitmap 的说明）。
        Bitmap largeIcon = coverBitmap != null ? coverBitmap : appIconBitmap();
        if (largeIcon != null) builder.setLargeIcon(largeIcon);

        builder.addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_previous, "上一首", actionIntent(ACTION_PREV, 11)).build());
        builder.addAction(new Notification.Action.Builder(
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "暂停" : "播放",
                actionIntent(playing ? ACTION_PAUSE : ACTION_PLAY, 12)).build());
        builder.addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_next, "下一首", actionIntent(ACTION_NEXT, 13)).build());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && mediaSession != null) {
            builder.setStyle(new Notification.MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2));

            long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                    | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
                    | PlaybackState.ACTION_SKIP_TO_PREVIOUS;
            // 位置必须是**有效毫秒数**，不能用 PLAYBACK_POSITION_UNKNOWN：
            // 系统拿不到有效位置时，通知栏那张卡片的时间会显示成 00:00 - 00:00
            // （用户实测反馈）。时长未知时才退回 UNKNOWN。
            long statePosition = durationMs > 0 ? Math.min(positionMs, durationMs) : PlaybackState.PLAYBACK_POSITION_UNKNOWN;
            PlaybackState.Builder playback = new PlaybackState.Builder()
                    .setActions(actions)
                    .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                            statePosition, playing ? 1f : 0f);
            if (durationMs > 0) playback.setBufferedPosition(durationMs);
            mediaSession.setPlaybackState(playback.build());

            MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                    .putString(MediaMetadata.METADATA_KEY_ALBUM, album)
                    .putString(MediaMetadata.METADATA_KEY_MEDIA_ID, mediaId)
                    .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
            // 专辑图同样给位图（拿不到封面就用应用图标），避免系统侧拿到资源型 Icon
            if (largeIcon != null) {
                metadata.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, largeIcon);
                metadata.putBitmap(MediaMetadata.METADATA_KEY_ART, largeIcon);
            }
            mediaSession.setMetadata(metadata.build());
            metadataDurationMs = durationMs;
        }

        Notification notification = builder.build();
        // 通知对象交给前台服务复用（同进程，走静态字段）
        MediaPlaybackService.currentNotification = notification;
        manager.notify(NOTIFICATION_ID, notification);

        // 前台服务只在「当前有曲目」时存活，但**不跟随播放/暂停**。
        // 绑在 playing 上的话，一旦暂停（或状态抖动）服务就被停掉、通知一起消失，
        // 用户再从通知栏按播放就没得按了 —— 实测按 HOME 退后台后服务直接归零。
        // 真正的回收时机是 hide()（没有曲目了）。
        try {
            Intent serviceIntent = new Intent(context, MediaPlaybackService.class);
            if (visible) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            } else {
                context.stopService(serviceIntent);
            }
        } catch (Throwable error) {
            System.err.println("[MediaNotification] 前台服务切换失败: " + error.getMessage());
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (actionReceiver != null) {
                getContext().unregisterReceiver(actionReceiver);
                actionReceiver = null;
            }
        } catch (Throwable ignored) {
        }
        super.handleOnDestroy();
    }
}
