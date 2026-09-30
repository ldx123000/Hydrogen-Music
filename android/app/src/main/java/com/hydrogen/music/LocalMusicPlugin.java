package com.hydrogen.music;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Android 本地音乐：用系统的「目录选择器」授权一个目录，再扫描其中的音频文件。
 *
 * 为什么必须走原生：
 *   1) 安卓是分区存储，应用不能像桌面那样用文件路径遍历任意目录。唯一正规途径是
 *      SAF（Storage Access Framework）——ACTION_OPEN_DOCUMENT_TREE 让用户选目录并授权，
 *      URI 还必须持久化（takePersistableUriPermission）才能跨重启使用。
 *   2) 标题/歌手/专辑/内嵌封面/时长要用 MediaMetadataRetriever 读，WebView 里没有这些能力。
 *
 * 刻意**不引入 androidx.documentfile**：本工程不跑 cap sync，新增依赖要走 Gradle 联网
 * 拉取，容易在离线环境构建失败。这里用系统自带的 DocumentsContract 直接递归，
 * 只依赖 Android framework 本身。
 *
 * 返回的数据结构与桌面端 dirTree.js 保持一致（folder / music 节点），
 * 这样前端 locaMusic.js 的解析、分类、文件夹索引都能直接复用，不必为安卓另写一套。
 *
 * JS 侧调用：
 *   LocalMusic.pickFolder()   → 打开目录选择器；resolve { uri, name }
 *   LocalMusic.getFolder()    → 返回已授权目录 { uri, name }，未设置时返回 {}
 *   LocalMusic.clearFolder()  → 清除授权
 *   LocalMusic.scan({ type }) → 扫描；resolve { type, count, metadata }
 */
@CapacitorPlugin(name = "LocalMusic")
public class LocalMusicPlugin extends Plugin {

    private static final String PREFS = "hydrogen_local_music";
    private static final String KEY_TREE_URI = "tree_uri";
    private static final String KEY_TREE_NAME = "tree_name";

    /** 支持的音频扩展名（与桌面端 dirTree 的 MUSIC_TYPES 对齐）。 */
    private static final Set<String> AUDIO_EXT = new HashSet<>();
    static {
        AUDIO_EXT.add("mp3"); AUDIO_EXT.add("flac"); AUDIO_EXT.add("wav"); AUDIO_EXT.add("m4a");
        AUDIO_EXT.add("aac"); AUDIO_EXT.add("ogg"); AUDIO_EXT.add("opus"); AUDIO_EXT.add("wma");
        AUDIO_EXT.add("ape"); AUDIO_EXT.add("aiff"); AUDIO_EXT.add("aif"); AUDIO_EXT.add("alac");
        AUDIO_EXT.add("dsf"); AUDIO_EXT.add("mp4"); AUDIO_EXT.add("mka");
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
    }

    private static String extOf(String name) {
        if (name == null) return "";
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) return "";
        return name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    // ---------------------------------------------------------------- 目录选择

    /**
     * 打开系统目录选择器，由**用户自己选**要扫描的文件夹。
     *
     * 刻意不设 EXTRA_INITIAL_URI：
     *   曾尝试把起始位置预设成「下载」目录，但各 ROM 差异很大 —— 实测 MIUI 上
     *   给 root URI（…/root/downloads）会被忽略，选择器仍停在存储根目录，
     *   而 Android 11+ 禁止把根目录作为选择目标（按钮置灰、提示"无法使用此文件夹"），
     *   用户就会以为"下载目录选不了"。
     *   交给用户自己点进目标文件夹（如「下载」），再点「使用此文件夹」，行为最可预期。
     *
     * 授权会持久化（takePersistableUriPermission），之后扫描只读这一个 tree，
     * 不会去碰用户没授权的目录。
     */
    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("no-uri");
            return;
        }

        // 持久化授权，否则应用重启后就读不到了
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                    treeUri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Throwable ignored) { }

        String name = displayNameOf(treeUri);
        prefs().edit().putString(KEY_TREE_URI, treeUri.toString()).putString(KEY_TREE_NAME, name).apply();

        JSObject ret = new JSObject();
        ret.put("uri", treeUri.toString());
        ret.put("name", name);
        call.resolve(ret);
    }

    @PluginMethod
    public void getFolder(PluginCall call) {
        String uri = prefs().getString(KEY_TREE_URI, null);
        if (uri == null || !hasPersistedPermission(uri)) {
            call.resolve(new JSObject());   // 空对象 = 尚未设置
            return;
        }
        JSObject ret = new JSObject();
        ret.put("uri", uri);
        ret.put("name", prefs().getString(KEY_TREE_NAME, ""));
        call.resolve(ret);
    }

    @PluginMethod
    public void clearFolder(PluginCall call) {
        prefs().edit().remove(KEY_TREE_URI).remove(KEY_TREE_NAME).apply();
        call.resolve();
    }

    /**
     * 读取本地音频的内嵌封面，返回 data URL（前端直接塞给 img）。
     *
     * 与桌面端 Electron 的 getLocalMusicImage 对应。桌面端从文件系统读，
     * 安卓这边媒体是 content://，WebView 读不了，统一在这里转成 data URL。
     * 没带封面就返回空串，前端会走它自己的占位逻辑。
     */
    @PluginMethod
    public void getMusicImage(PluginCall call) {
        final String raw = call.getString("uri", null);
        if (raw == null || raw.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("dataUrl", "");
            call.resolve(empty);
            return;
        }
        new Thread(() -> {
            MediaMetadataRetriever mmr = new MediaMetadataRetriever();
            final Uri mediaUri = Uri.parse(raw);
            try {
                mmr.setDataSource(getContext(), mediaUri);
                byte[] pic = mmr.getEmbeddedPicture();
                JSObject ret = new JSObject();
                if (pic != null && pic.length > 0) {
                    Bitmap bmp = BitmapFactory.decodeByteArray(pic, 0, pic.length);
                    if (bmp != null) {
                        ByteArrayOutputStream bos = new ByteArrayOutputStream();
                        bmp.compress(Bitmap.CompressFormat.JPEG, 85, bos);
                        ret.put("dataUrl", "data:image/jpeg;base64,"
                                + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP));
                        bmp.recycle();
                    } else {
                        ret.put("dataUrl", "");
                    }
                } else {
                    // 没内嵌封面就找同目录同名图片（网易云这类文件封面在接口里，不写进文件）
                    String sidecar = readSidecarCover(mediaUri);
                    ret.put("dataUrl", sidecar == null ? "" : sidecar);
                }
                call.resolve(ret);
            } catch (Throwable error) {
                JSObject ret = new JSObject();
                ret.put("dataUrl", "");
                call.resolve(ret);
            } finally {
                try { mmr.release(); } catch (Throwable ignored) { }
            }
        }).start();
    }

    /**
     * 读取本地歌词，按优先级：
     *   1) 内嵌歌词（ID3 USLT / Vorbis LYRICS / MP4 ©lyr）—— 直接扫文件字节找同步歌词文本
     *   2) 同名 .lrc 侧车文件（音频所在目录里 "歌名.lrc"）
     * 都找不到返回空，前端会显示"暂无歌词"。
     *
     * 说明：MediaMetadataRetriever 没有公开的歌词字段，所以这里自己从字节里提取；
     * 提取不到再退回侧车文件，属于"有就分，没有就不显示"的约定。
     */
    @PluginMethod
    public void getMusicLyric(PluginCall call) {
        final String raw = call.getString("uri", null);
        if (raw == null || raw.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("lyric", "");
            call.resolve(empty);
            return;
        }
        new Thread(() -> {
            JSObject ret = new JSObject();
            ret.put("lyric", "");
            try {
                Uri uri = Uri.parse(raw);
                String embedded = readEmbeddedLyric(uri);
                if (embedded != null && !embedded.isEmpty()) {
                    ret.put("lyric", embedded);
                    ret.put("source", "embedded");
                    call.resolve(ret);
                    return;
                }
                String sidecar = readSidecarLyric(uri);
                if (sidecar != null && !sidecar.isEmpty()) {
                    ret.put("lyric", sidecar);
                    ret.put("source", "sidecar");
                    call.resolve(ret);
                    return;
                }
                call.resolve(ret);
            } catch (Throwable ignored) {
                call.resolve(ret);
            }
        }).start();
    }

    /** 从音频文件字节里找内嵌歌词（尽量少读：先看前 256KB，再补尾部）。 */
    private String readEmbeddedLyric(Uri uri) {
        try {
            android.content.ContentResolver resolver = getContext().getContentResolver();
            try (InputStream in = resolver.openInputStream(uri)) {
                if (in == null) return null;
                byte[] head = new byte[256 * 1024];
                int read = 0;
                while (read < head.length) {
                    int n = in.read(head, read, head.length - read);
                    if (n <= 0) break;
                    read += n;
                }
                String text = new String(head, 0, read, "ISO-8859-1");
                // ID3v2 的 USLT 帧 / Vorbis 的 LYRICS 字段 / MP4 的 ©lyr
                String[] markers = { "USLT", "LYRICS=", "UNSYNCEDLYRICS", "\u00a9lyr" };
                for (String marker : markers) {
                    int idx = text.indexOf(marker);
                    if (idx < 0) continue;
                    String candidate = extractLyricText(text.substring(idx, Math.min(text.length(), idx + 20000)));
                    if (candidate != null && candidate.contains("[")) return candidate;
                }
            }
        } catch (Throwable ignored) { }
        return null;
    }

    /** 从帧数据里截出可用的 LRC 文本（出现 [mm:ss 之后的部分）。 */
    private String extractLyricText(String chunk) {
        int start = chunk.indexOf('[');
        if (start < 0) return null;
        StringBuilder sb = new StringBuilder();
        for (int i = start; i < chunk.length(); i++) {
            char c = chunk.charAt(i);
            if (c == 0) break;
            // 过滤控制字符，保留换行
            if (c == '\n' || c == '\r' || (c >= 32 && c != 127)) sb.append(c);
            if (sb.length() > 12000) break;
        }
        String result = sb.toString().trim();
        return result.isEmpty() ? null : result;
    }

    /**
     * 找音频同目录下的同名图片作为封面（.jpg/.jpeg/.png/.webp）。
     *
     * 优先用 MediaStore 查询（Android 10+ 分区存储下直接按路径读文件不可靠），
     * 查不到再退回文件直读。
     */
    private String readSidecarCover(Uri uri) {
        try {
            // 先从 MediaStore 拿到该音频所在目录与基名
            String relPath = null;
            String displayName = null;
            try (Cursor cursor = getContext().getContentResolver().query(uri,
                    new String[] {
                            android.provider.MediaStore.MediaColumns.RELATIVE_PATH,
                            android.provider.MediaStore.MediaColumns.DISPLAY_NAME,
                    }, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    relPath = cursor.isNull(0) ? "" : cursor.getString(0);
                    displayName = cursor.isNull(1) ? "" : cursor.getString(1);
                }
            }
            if (displayName == null || displayName.isEmpty()) return null;
            String base = stripExtension(displayName);
            if (relPath == null) relPath = "";

            String[] exts = { ".jpg", ".jpeg", ".png", ".webp" };
            for (String ext : exts) {
                Uri found = findInMediaStore(relPath, base + ext);
                if (found == null) continue;
                byte[] data = readBytesFromUri(found);
                if (data == null || data.length == 0) continue;
                String lower = ext.toLowerCase(java.util.Locale.ROOT);
                String mime = lower.equals(".png") ? "image/png"
                        : lower.equals(".webp") ? "image/webp" : "image/jpeg";
                return "data:" + mime + ";base64," + Base64.encodeToString(data, Base64.NO_WRAP);
            }
        } catch (Throwable ignored) { }
        return null;
    }

    /** 在 MediaStore.Files 里按相对目录 + 文件名找文件。 */
    private Uri findInMediaStore(String relativePath, String fileName) {
        try {
            Uri collection = android.provider.MediaStore.Files.getContentUri("external");
            String selection = android.provider.MediaStore.Files.FileColumns.RELATIVE_PATH + "=? AND "
                    + android.provider.MediaStore.Files.FileColumns.DISPLAY_NAME + "=?";
            String[] args = new String[] { relativePath == null ? "" : relativePath, fileName };
            try (Cursor cursor = getContext().getContentResolver().query(collection,
                    new String[] { android.provider.MediaStore.Files.FileColumns._ID },
                    selection, args, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    long id = cursor.getLong(0);
                    return android.content.ContentUris.withAppendedId(collection, id);
                }
            }
        } catch (Throwable ignored) { }
        return null;
    }

    /** 通过 content:// 读全部字节（分区存储下唯一可靠的方式）。 */
    private byte[] readBytesFromUri(Uri uri) {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) return null;
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buffer = new byte[32 * 1024];
            int len;
            while ((len = in.read(buffer)) > 0) bos.write(buffer, 0, len);
            return bos.toByteArray();
        } catch (Throwable ignored) {
            return null;
        }
    }

    /** 找音频同目录下的同名 .lrc。 */
    private String readSidecarLyric(Uri uri) {
        try {
            java.io.File audio = resolveExternalFile(uri);
            if (audio == null) return null;
            java.io.File dir = audio.getParentFile();
            if (dir == null) return null;
            java.io.File lrc = new java.io.File(dir, stripExtension(audio.getName()) + ".lrc");
            if (!lrc.exists()) return null;
            byte[] data = readFileBytes(lrc);
            return data == null ? null : new String(data, "UTF-8");
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static String stripExtension(String fileName) {
        if (fileName == null) return "";
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }

    private byte[] readFileBytes(java.io.File file) {
        try (InputStream in = new java.io.FileInputStream(file)) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buffer = new byte[32 * 1024];
            int len;
            while ((len = in.read(buffer)) > 0) bos.write(buffer, 0, len);
            return bos.toByteArray();
        } catch (Throwable ignored) {
            return null;
        }
    }

    /**
     * 把音频的 content:// 换成真实文件路径。
     *
     * Android 10+ 分区存储下 MediaStore 的 DATA 列对第三方不可见，
     * 所以这里**用同一份 MediaStore 索引反查**：先拿这首音频的
     * RELATIVE_PATH 与 DISPLAY_NAME，再拼出同目录侧车文件（.lrc / 同名图片）
     * 并用 MediaStore 的查询确认它存在、拿到它的真实读取方式。
     *
     * 因此本方法返回的是"音频所在目录 + 基名"，调用方再去拼侧车文件名。
     * （真正的字节读取统一走 ContentResolver / MediaStore，不依赖文件路径权限。）
     */
    private java.io.File resolveExternalFile(Uri uri) {
        String authority = uri.getAuthority();
        try {
            if (authority != null && authority.startsWith("media")) {
                // 反查该音频在公共存储里的相对目录 + 显示名
                try (Cursor cursor = getContext().getContentResolver().query(uri,
                        new String[] {
                                android.provider.MediaStore.MediaColumns.RELATIVE_PATH,
                                android.provider.MediaStore.MediaColumns.DISPLAY_NAME,
                        }, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        String rel = cursor.isNull(0) ? "" : cursor.getString(0);
                        String name = cursor.isNull(1) ? "" : cursor.getString(1);
                        if (!name.isEmpty()) {
                            if (rel == null) rel = "";
                            // 仅用于拼出同级文件名，本身不直接做文件 IO
                            return new java.io.File(
                                    android.os.Environment.getExternalStorageDirectory(), rel + name);
                        }
                    }
                }
                return null;
            }

            String docId = android.provider.DocumentsContract.getDocumentId(uri);
            if (docId == null) return null;
            int colon = docId.indexOf(':');
            if (colon < 0) return null;
            String prefix = docId.substring(0, colon);
            String rel = docId.substring(colon + 1);
            if (!"primary".equalsIgnoreCase(prefix)) return null;
            return new java.io.File(android.os.Environment.getExternalStorageDirectory(), rel);
        } catch (Throwable ignored) {
            return null;
        }
    }

    /**
     * 把本地音频读成 base64 交给前端。
     *
     * 为什么需要：安卓上媒体是 content:// URI，WebView 里的 &lt;audio&gt;/Howler 读不了它，
     * 于是本地歌曲点了不出声。曾尝试用 WebViewClient.shouldInterceptRequest 做 HTTP 代理，
     * 实测**根本不被调用**（媒体请求会绕过 WebViewClient），所以改成这条确定可行的路：
     * 原生读出字节 → 前端转成 blob URL → 交给播放器（blob 支持 Range，能拖动进度）。
     */
    @PluginMethod
    public void readAudioBase64(PluginCall call) {
        final String raw = call.getString("uri", null);
        if (raw == null || raw.isEmpty()) {
            call.reject("no-uri");
            return;
        }
        new Thread(() -> {
            InputStream in = null;
            try {
                Uri uri = Uri.parse(raw);
                android.content.ContentResolver resolver = getContext().getContentResolver();
                in = resolver.openInputStream(uri);
                if (in == null) { call.reject("cannot-open"); return; }

                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buffer = new byte[64 * 1024];
                int len;
                while ((len = in.read(buffer)) > 0) bos.write(buffer, 0, len);
                byte[] bytes = bos.toByteArray();

                String mime = resolver.getType(uri);
                if (mime == null || mime.isEmpty()) mime = "audio/mpeg";

                JSObject ret = new JSObject();
                ret.put("mime", mime);
                ret.put("size", bytes.length);
                ret.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                call.resolve(ret);
            } catch (Throwable error) {
                call.reject("read-failed: " + error.getMessage());
            } finally {
                if (in != null) { try { in.close(); } catch (Throwable ignored) { } }
            }
        }).start();
    }

    private boolean hasPersistedPermission(String uriString) {
        try {
            Uri uri = Uri.parse(uriString);
            for (UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
                if (p.getUri().equals(uri) && p.isReadPermission()) return true;
            }
        } catch (Throwable ignored) { }
        return false;
    }

    /** 提供方（authority）当前是否还装在机器上。 */
    private boolean isProviderAvailable(String uriString) {
        try {
            String authority = Uri.parse(uriString).getAuthority();
            if (authority == null) return false;
            for (android.content.pm.ProviderInfo info : getContext().getPackageManager()
                    .queryContentProviders(null, android.os.Process.myUid(), 0)) {
                if (authority.equals(info.authority)) return true;
            }
            // queryContentProviders 只列本进程可见的，兜底再按包名/authority 解析一次
            return getContext().getPackageManager().resolveContentProvider(authority, 0) != null;
        } catch (Throwable ignored) {
            return false;
        }
    }

    /** 清掉已失效的目录授权，并释放系统侧的持久化权限。 */
    private void clearStaleFolder() {
        try {
            String uriString = prefs().getString(KEY_TREE_URI, null);
            if (uriString != null) {
                getContext().getContentResolver().releasePersistableUriPermission(
                        Uri.parse(uriString),
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            }
        } catch (Throwable ignored) { }
        prefs().edit().remove(KEY_TREE_URI).remove(KEY_TREE_NAME).apply();
    }

    // ---------------------------------------------------------------- 扫描

    @PluginMethod
    public void scan(PluginCall call) {
        final String type = call.getString("type", "local");

        // Android 优先走 MediaStore：系统媒体库会自动索引公共目录里的音频，
        // 不需要任何授权，也不会出现"下载目录"和"扫描目录"对不上的问题
        // （实测踩过：下载写进系统 Download，而 SAF 授权指向第三方 provider 的
        //  另一个 "Download"，于是永远扫不到）。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            new Thread(() -> {
                try {
                    JSObject metadata = scanViaMediaStore(type);
                    JSObject ret = new JSObject();
                    ret.put("type", type);
                    ret.put("count", metadata.getInteger("count", 0));
                    ret.put("metadata", metadata);
                    call.resolve(ret);
                } catch (Throwable error) {
                    call.reject("scan-failed: " + error.getMessage());
                }
            }).start();
            return;
        }

        // Android 10 以下没有分区存储，仍走 SAF 授权目录
        String uriString = prefs().getString(KEY_TREE_URI, null);
        if (uriString == null || !hasPersistedPermission(uriString)) {
            clearStaleFolder();
            call.reject("no-folder");
            return;
        }
        if (!isProviderAvailable(uriString)) {
            clearStaleFolder();
            call.reject("provider-unavailable");
            return;
        }

        // 读元数据是 IO 密集操作，放后台线程，避免卡住 UI
        new Thread(() -> {
            try {
                Uri treeUri = Uri.parse(uriString);
                String rootDocId = DocumentsContract.getTreeDocumentId(treeUri);
                Uri rootChildren = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, rootDocId);

                String rootName = prefs().getString(KEY_TREE_NAME, "");
                if (rootName == null || rootName.isEmpty()) rootName = "本地音乐";

                JSArray children = new JSArray();
                int[] counter = new int[] { 0 };
                walk(treeUri, rootChildren, children, counter, 0);

                JSObject metadata = new JSObject();
                metadata.put("id", UUID.randomUUID().toString());
                metadata.put("name", rootName);
                metadata.put("dirPath", treeUri.toString());
                metadata.put("type", "folder");
                metadata.put("children", children);

                JSObject ret = new JSObject();
                ret.put("type", type);
                ret.put("count", counter[0]);
                ret.put("metadata", metadata);
                call.resolve(ret);
            } catch (Throwable error) {
                call.reject("scan-failed: " + error.getMessage());
            }
        }).start();
    }

    /**
     * 递归遍历一层子项。
     *
     * @param depth 层级上限保护，避免异常的自引用目录导致无限递归
     */
    private void walk(Uri treeUri, Uri childrenUri, JSArray out, int[] counter, int depth) {
        if (depth > 24) return;

        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(childrenUri, new String[] {
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE,
                    DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            }, null, null, null);
            if (cursor == null) return;

            while (cursor.moveToNext()) {
                String docId = cursor.getString(0);
                String name = cursor.getString(1);
                String mime = cursor.getString(2);
                long modified = cursor.isNull(3) ? 0L : cursor.getLong(3);
                if (name == null) continue;

                Uri docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);

                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    JSObject folderNode = new JSObject();
                    folderNode.put("id", UUID.randomUUID().toString());
                    folderNode.put("name", name);
                    folderNode.put("dirPath", docUri.toString());
                    folderNode.put("type", "folder");
                    JSArray childArray = new JSArray();
                    folderNode.put("children", childArray);
                    out.put(folderNode);

                    Uri grandChildren = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId);
                    walk(treeUri, grandChildren, childArray, counter, depth + 1);
                    continue;
                }

                if (!AUDIO_EXT.contains(extOf(name))) continue;

                JSObject node = buildSafMusicNode(docUri, name, modified);
                if (node != null) {
                    out.put(node);
                    counter[0]++;
                }
            }
        } catch (Throwable ignored) {
            // 单个目录读失败不影响其它目录
        } finally {
            if (cursor != null) { try { cursor.close(); } catch (Throwable ignored) { } }
        }
    }

    /** 单个音频 → 与桌面端 dirTree.createMusicFileNode 相同的节点结构。 */
    private JSObject buildMusicNode(Uri docUri, String fileName, long modified) {
        String uriString = docUri.toString();

        JSObject node = new JSObject();
        node.put("id", UUID.randomUUID().toString());
        node.put("name", fileName);
        node.put("dirPath", uriString);
        node.put("modifiedTime", modified);

        String ext = extOf(fileName);
        String baseName = ext.isEmpty() ? fileName : fileName.substring(0, fileName.length() - ext.length() - 1);

        String title = baseName, artist = "", album = "";
        long durationMs = 0;
        String cover = null;

        MediaMetadataRetriever mmr = new MediaMetadataRetriever();
        try {
            mmr.setDataSource(getContext(), docUri);
            String t = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE);
            String a = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST);
            String al = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM);
            String d = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            if (t != null && !t.trim().isEmpty()) title = t.trim();
            if (a != null) artist = a.trim();
            if (al != null) album = al.trim();
            if (d != null) {
                try { durationMs = Long.parseLong(d.trim()); } catch (Throwable ignored) { }
            }

            // 内嵌封面 → data URL（WebView 读不了 content:// 图片，必须转成内联数据）
            try {
                byte[] pic = mmr.getEmbeddedPicture();
                if (pic != null && pic.length > 0) {
                    Bitmap bmp = BitmapFactory.decodeByteArray(pic, 0, pic.length);
                    if (bmp != null) {
                        ByteArrayOutputStream bos = new ByteArrayOutputStream();
                        bmp.compress(Bitmap.CompressFormat.JPEG, 85, bos);
                        cover = "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
                        bmp.recycle();
                    }
                }
            } catch (Throwable ignored) { }
        } catch (Throwable ignored) {
            // 读不出元数据就退化为文件名，与桌面端的降级行为一致
        } finally {
            try { mmr.release(); } catch (Throwable ignored) { }
        }

        return buildNode(uriString, fileName, modified, baseName, title, artist, album, durationMs, ext, cover);
    }

    /** 组装节点（SAF 与 MediaStore 两条扫描路径共用）。 */
    private JSObject buildNode(String uriString, String fileName, long modified, String baseName,
                               String title, String artist, String album, long durationMs,
                               String ext, String cover) {
        JSObject node = new JSObject();
        node.put("id", UUID.randomUUID().toString());
        node.put("name", fileName);
        node.put("dirPath", uriString);
        node.put("modifiedTime", modified);
        // 歌曲节点也必须带 children（空数组）。
        // 前端的列表项会读 item.children.length 判断"是否是文件夹 / 是否可展开"，
        // 缺了这个字段会抛 TypeError，被 Vue 静默吞掉，页面就变成一片空白。
        node.put("children", new JSArray());

        JSObject common = new JSObject();
        common.put("localTitle", baseName);
        common.put("fileUrl", uriString);
        common.put("title", title);
        JSArray artists = new JSArray();
        if (artist != null && !artist.isEmpty()) {
            for (String one : artist.split("[/、,，]")) {
                String v = one.trim();
                if (!v.isEmpty()) artists.put(v);
            }
        }
        common.put("artists", artists);
        common.put("album", album == null ? "" : album);
        common.put("albumartist", "");
        common.put("date", "");
        common.put("genre", "");
        common.put("year", "");
        if (cover != null) common.put("cover", cover);

        JSObject format = new JSObject();
        format.put("bitrate", 0);
        format.put("bitsPerSample", 0);
        format.put("container", ext);
        format.put("duration", durationMs > 0 ? durationMs / 1000.0 : 0);
        format.put("sampleRate", 0);

        node.put("common", common);
        node.put("format", format);
        return node;
    }

    // ---------------------------------------------------------------- MediaStore 扫描

    /**
     * 通过系统媒体库扫描音频。
     *
     * 用 MediaStore 的好处：
     *   · 不需要任何目录授权，系统已索引公共目录（Download / Music 等）
     *   · 下载（也是写 MediaStore）与扫描天然是同一份数据，不会再出现"下载了却扫不到"
     *   · 元数据由系统索引提供，读取成本低于逐个 setDataSource
     *
     * 按 RELATIVE_PATH 还原出文件夹层级，保持与桌面端 dirTree 相同的树形状，
     * 前端的文件夹分类逻辑不用改。
     */
    private JSObject scanViaMediaStore(String type) throws Exception {
        Uri collection = android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        String[] projection = new String[] {
                android.provider.MediaStore.Audio.Media._ID,
                android.provider.MediaStore.Audio.Media.DISPLAY_NAME,
                android.provider.MediaStore.Audio.Media.TITLE,
                android.provider.MediaStore.Audio.Media.ARTIST,
                android.provider.MediaStore.Audio.Media.ALBUM,
                android.provider.MediaStore.Audio.Media.DURATION,
                android.provider.MediaStore.Audio.Media.RELATIVE_PATH,
                android.provider.MediaStore.Audio.Media.DATE_MODIFIED,
                android.provider.MediaStore.Audio.Media.IS_MUSIC,
        };
        // 只取音乐；type=downloaded 时限定在公共「下载」目录，
        // 这样"下载管理"看到的就是下载来的那些歌，跟桌面端语义一致。
        String selection = android.provider.MediaStore.Audio.Media.IS_MUSIC + " != 0";
        if ("downloaded".equals(type)) {
            selection += " AND " + android.provider.MediaStore.Audio.Media.RELATIVE_PATH + " LIKE ?";
        }
        String[] args = "downloaded".equals(type)
                ? new String[] { "%" + android.os.Environment.DIRECTORY_DOWNLOADS + "%" }
                : null;

        // 根节点 + 目录索引（按相对路径建树）
        JSObject rootNode = new JSObject();
        rootNode.put("id", UUID.randomUUID().toString());
        String rootName = "downloaded".equals(type) ? "Download" : "本地音乐";
        rootNode.put("name", rootName);
        rootNode.put("dirPath", "mediastore:/");
        rootNode.put("type", "folder");
        JSArray rootChildren = new JSArray();
        rootNode.put("children", rootChildren);

        java.util.Map<String, JSArray> dirChildren = new java.util.HashMap<>();
        java.util.Map<String, JSObject> dirNodes = new java.util.HashMap<>();
        dirChildren.put("", rootChildren);

        int count = 0;
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(collection, projection, selection, args, null);
            if (cursor == null) throw new IllegalStateException("mediaStoreQueryNull");

            int idxId = cursor.getColumnIndex(android.provider.MediaStore.Audio.Media._ID);
            int idxName = cursor.getColumnIndex(android.provider.MediaStore.Audio.Media.DISPLAY_NAME);
            int idxTitle = cursor.getColumnIndex(android.provider.MediaStore.Audio.Media.TITLE);
            int idxArtist = cursor.getColumnIndex(android.provider.MediaStore.Audio.Media.ARTIST);
            int idxAlbum = cursor.getColumnIndex(android.provider.MediaStore.Audio.Media.ALBUM);
            int idxDur = cursor.getColumnIndex(android.provider.MediaStore.Audio.Media.DURATION);
            int idxPath = cursor.getColumnIndex(android.provider.MediaStore.Audio.Media.RELATIVE_PATH);
            int idxMod = cursor.getColumnIndex(android.provider.MediaStore.Audio.Media.DATE_MODIFIED);

            while (cursor.moveToNext()) {
                String fileName = idxName >= 0 ? cursor.getString(idxName) : null;
                if (fileName == null || !AUDIO_EXT.contains(extOf(fileName))) continue;

                long id = idxId >= 0 ? cursor.getLong(idxId) : 0;
                Uri fileUri = android.content.ContentUris.withAppendedId(collection, id);
                String relPath = idxPath >= 0 && !cursor.isNull(idxPath) ? cursor.getString(idxPath) : "";
                // 下载管理的根节点名就是「下载」目录时，不要再为它套一层同名文件夹，
                // 否则会显示成 Download > Download > 歌曲。
                if ("downloaded".equals(type) && !relPath.isEmpty()) {
                    relPath = "";
                }
                long modified = idxMod >= 0 && !cursor.isNull(idxMod) ? cursor.getLong(idxMod) * 1000L : 0L;

                String title = idxTitle >= 0 && !cursor.isNull(idxTitle) ? cursor.getString(idxTitle) : null;
                String artist = idxArtist >= 0 && !cursor.isNull(idxArtist) ? cursor.getString(idxArtist) : "";
                String album = idxAlbum >= 0 && !cursor.isNull(idxAlbum) ? cursor.getString(idxAlbum) : "";
                long duration = idxDur >= 0 && !cursor.isNull(idxDur) ? cursor.getLong(idxDur) : 0L;

                // 系统索引里 ARTIST 可能是 "<unknown>"，这种情况交给前端按文件名显示
                if (artist != null && artist.contains("<unknown>")) artist = "";

                String ext = extOf(fileName);
                String baseName = ext.isEmpty() ? fileName : fileName.substring(0, fileName.length() - ext.length() - 1);
                String displayTitle = (title == null || title.trim().isEmpty()) ? baseName : title.trim();

                // 找到该文件所属目录的子节点数组，必要时逐级创建文件夹节点
                JSArray bucket = ensureDirChain(relPath, rootChildren, dirNodes, dirChildren);

                JSObject node = buildNode(fileUri.toString(), fileName, modified, baseName,
                        displayTitle, artist, album, duration, ext, null);
                bucket.put(node);
                count++;
            }
        } finally {
            if (cursor != null) { try { cursor.close(); } catch (Throwable ignored) { } }
        }

        JSObject metadata = new JSObject();
        metadata.put("id", UUID.randomUUID().toString());
        metadata.put("name", rootName);
        metadata.put("dirPath", "mediastore:/");
        metadata.put("type", "folder");
        metadata.put("children", rootChildren);
        metadata.put("count", count);
        return metadata;
    }

    /** 按 "Download/Sub/" 这样的相对路径逐级建立文件夹节点，返回该层应放入的数组。 */
    private JSArray ensureDirChain(String relativePath, JSArray rootChildren,
                                    java.util.Map<String, JSObject> dirNodes,
                                    java.util.Map<String, JSArray> dirChildren) {
        if (relativePath == null || relativePath.isEmpty()) return rootChildren;

        String normalized = relativePath.replace('\\', '/');
        while (normalized.startsWith("/")) normalized = normalized.substring(1);
        while (normalized.endsWith("/")) normalized = normalized.substring(0, normalized.length() - 1);
        if (normalized.isEmpty()) return rootChildren;

        String[] parts = normalized.split("/");
        StringBuilder accumulated = new StringBuilder();
        JSArray bucket = rootChildren;

        for (String part : parts) {
            if (part.isEmpty()) continue;
            if (accumulated.length() > 0) accumulated.append('/');
            accumulated.append(part);
            String key = accumulated.toString();

            JSObject dirNode = dirNodes.get(key);
            if (dirNode == null) {
                dirNode = new JSObject();
                dirNode.put("id", UUID.randomUUID().toString());
                dirNode.put("name", part);
                dirNode.put("dirPath", "mediastore:/" + key);
                dirNode.put("type", "folder");
                JSArray childArray = new JSArray();
                dirNode.put("children", childArray);
                bucket.put(dirNode);
                dirNodes.put(key, dirNode);
                dirChildren.put(key, childArray);
            }
            bucket = dirChildren.get(key);
        }
        return bucket;
    }

    /** 单个音频 → 与桌面端 dirTree.createMusicFileNode 相同的节点结构（SAF 路径）。 */
    private JSObject buildSafMusicNode(Uri docUri, String fileName, long modified) {
        String uriString = docUri.toString();
        String ext = extOf(fileName);
        String baseName = ext.isEmpty() ? fileName : fileName.substring(0, fileName.length() - ext.length() - 1);

        String title = baseName, artist = "", album = "";
        long durationMs = 0;
        String cover = null;

        MediaMetadataRetriever mmr = new MediaMetadataRetriever();
        try {
            mmr.setDataSource(getContext(), docUri);
            String t = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE);
            String a = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST);
            String al = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM);
            String d = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            if (t != null && !t.trim().isEmpty()) title = t.trim();
            if (a != null) artist = a.trim();
            if (al != null) album = al.trim();
            if (d != null) {
                try { durationMs = Long.parseLong(d.trim()); } catch (Throwable ignored) { }
            }

            // 内嵌封面 → data URL（WebView 读不了 content:// 图片，必须转成内联数据）
            try {
                byte[] pic = mmr.getEmbeddedPicture();
                if (pic != null && pic.length > 0) {
                    Bitmap bmp = BitmapFactory.decodeByteArray(pic, 0, pic.length);
                    if (bmp != null) {
                        ByteArrayOutputStream bos = new ByteArrayOutputStream();
                        bmp.compress(Bitmap.CompressFormat.JPEG, 85, bos);
                        cover = "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
                        bmp.recycle();
                    }
                }
            } catch (Throwable ignored) { }
        } catch (Throwable ignored) {
            // 读不出元数据就退化为文件名，与桌面端的降级行为一致
        } finally {
            try { mmr.release(); } catch (Throwable ignored) { }
        }

        return buildNode(uriString, fileName, modified, baseName, title, artist, album, durationMs, ext, cover);
    }

    /** 取 SAF 目录的显示名（用 docId 的路径段，拿不到就退回常见目录名）。 */
    private String displayNameOf(Uri uri) {
        try {
            String docId = DocumentsContract.getTreeDocumentId(uri);
            if (docId != null) {
                int colon = docId.indexOf(':');
                if (colon >= 0 && colon < docId.length() - 1) return docId.substring(colon + 1);
                if (colon >= 0) return docId.substring(0, colon);
            }
        } catch (Throwable ignored) { }
        try {
            Cursor cursor = getContext().getContentResolver()
                    .query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (cursor != null) {
                try {
                    if (cursor.moveToFirst()) {
                        String name = cursor.getString(0);
                        if (name != null && !name.isEmpty()) return name;
                    }
                } finally { cursor.close(); }
            }
        } catch (Throwable ignored) { }
        String s = uri.toString();
        if (s.contains("downloads")) return "Download";
        return "本地音乐";
    }
}
