package com.hydrogen.music;

import android.app.Activity;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

/**
 * Android 音乐下载。
 *
 * 为什么需要它：桌面端下载完全依赖 Electron 主进程（src/electron/download.js，
 * 405 行：真实下载器 + ID3 标签写入 + 封面/歌词嵌入 + 进度/暂停/取消）。
 * webBridge 在安卓上把 windowApi.download 兜成了空函数，所以点下载没有任何反应。
 *
 * 本插件实现同一套契约：
 *   download({ url, name, type, id, source, lyrics, coverUrl, artists, album })
 *     → 边下边发 downloadProgress 事件；成功后发 downloadNext；失败发 downloadError(code)
 *   pause / resume / cancel 由前端 downloadManager 调用
 *
 * 技术要求：
 *   · 不引入任何第三方依赖（本工程不跑 cap sync，避免 Gradle 联网拉包）
 *   · 下载到 App 私有 cache，再复制到用户授权的目录（SAF），避免直接写 content:// 的复杂度
 *   · MP3 用自实现的 ID3v2.3 写入标题/歌手/专辑/内嵌封面
 *   · 未授权目录时返回 noSavePath，前端会提示"请先在设置中设置下载目录"
 */
@CapacitorPlugin(name = "MusicDownload")
public class MusicDownloadPlugin extends Plugin {

    private static final String PREFS = "hydrogen_local_music";
    private static final String KEY_TREE_URI = "tree_uri";

    private static final int BUFFER_SIZE = 64 * 1024;

    /** 取消/暂停标志按歌曲 id 记录（同一时刻只会有一个下载在跑）。 */
    private static volatile String activeId = null;
    private static volatile boolean cancelRequested = false;
    private static volatile boolean pauseRequested = false;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
    }

    // ---------------------------------------------------------------- 对外方法

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        final String name = call.getString("name", "未知歌曲");
        final String type = call.getString("type", "mp3");
        final String id = call.getString("id", "");
        final String album = call.getString("album", "");
        final String coverUrl = call.getString("coverUrl");
        final String artists = joinArtists(call);
        final String lyricText = extractLyric(call);
        final boolean saveLyricFile = Boolean.TRUE.equals(call.getBoolean("saveLyricFile", false));

        final String treeUriString = prefs().getString(KEY_TREE_URI, null);
        // Android 10+ 走 MediaStore 直接写公共「下载」目录，不需要用户先授权目录；
        // 低版本没有 MediaStore.Downloads，才要求先在设置里选一个目录。
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                && (treeUriString == null || treeUriString.isEmpty())) {
            notifyError("noSavePath");
            call.resolve();
            return;
        }

        // 结果先回给 JS，真正的下载在后台线程继续（与桌面端"下载是异步长任务"一致）
        call.resolve();

        new Thread(() -> runDownload(url, name, type, id, album, coverUrl, artists, lyricText, saveLyricFile, treeUriString)).start();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        pauseRequested = true;
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        pauseRequested = false;
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelRequested = true;
        pauseRequested = false;
        call.resolve();
    }

    // ---------------------------------------------------------------- 下载主流程

    private void runDownload(String url, String name, String type, String id, String album,
                             String coverUrl, String artists, String lyricText,
                             boolean saveLyricFile, String treeUriString) {
        activeId = id;
        cancelRequested = false;
        pauseRequested = false;

        File tempFile = null;
        try {
            String ext = normalizeExt(type);
            String fileName = sanitizeFileName(name) + "." + ext;
            tempFile = new File(getContext().getCacheDir(), "hm_dl_" + System.currentTimeMillis() + "." + ext);

            // 1) 下载到缓存
            if (!downloadToFile(url, tempFile, id)) {
                if (cancelRequested) { notifyError("cancelled"); return; }
                notifyError("downloadFailed");
                return;
            }

            // 2) 写入标签，让系统与其它播放器、以及本 App 的本地扫描都能识别歌名/歌手/封面。
            //    mp3 → ID3v2.3；flac → Vorbis Comment。其它格式保持原样（不动音频数据）。
            byte[] coverBytes = coverUrl != null && !coverUrl.isEmpty() ? fetchBytes(coverUrl) : null;
            try {
                if ("mp3".equals(ext)) {
                    writeId3v23(tempFile, name, artists, album, coverBytes);
                } else if ("flac".equals(ext)) {
                    writeFlacVorbisComment(tempFile, name, artists, album, coverBytes);
                }
            } catch (Throwable ignored) {
                // 标签写入失败不影响文件本身可用
            }

            // 2b) 一并存一张同名封面图片。
            // 网易云这类源把封面放在接口里、不写进音频文件；只写内嵌标签的话，
            // 像 flac 这种标签结构写失败时封面就彻底丢了，本地列表/播放器就"没有专辑图"。
            // 存成 <歌名>.jpg 后，本地扫描的 readSidecarCover 就能找到它。
            if (coverBytes != null && coverBytes.length > 0) {
                File coverFile = new File(getContext().getCacheDir(),
                        "hm_dl_" + System.currentTimeMillis() + ".jpg");
                try (FileOutputStream fos = new FileOutputStream(coverFile)) {
                    fos.write(coverBytes);
                }
                String coverName = sanitizeFileName(name) + ".jpg";
                saveToDestination(treeUriString, coverFile, coverName);
                //noinspection ResultOfMethodCallIgnored
                coverFile.delete();
            }

            // 3) 落盘到系统「下载」目录。
            //    优先用 MediaStore（Android 10+）：直接写公共 Download 目录，
            //    不需要 SAF 授权、也不受第三方 provider 能否写入的影响。
            //    低版本（< Q）没有 MediaStore.Downloads，退回 SAF 授权目录。
            String copyError;
            Uri savedUri = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                savedUri = copyToMediaStoreDownloads(tempFile, fileName);
                copyError = savedUri == null ? "mediaStoreFailed" : null;
            } else {
                copyError = copyToTree(treeUriString, tempFile, fileName);
            }
            if (copyError != null) {
                // 带上真实原因，前端提示与排查都靠它
                notifyError("saveFailed:" + copyError);
                return;
            }

            // 3b) 通知系统重新索引这个文件。
            // 文件是先落盘、之后才写入 ID3/封面标签的，MediaStore 的元数据缓存里
            // 没有封面；不刷新的话 MediaMetadataRetriever.getEmbeddedPicture()
            // 会一直返回空 —— 表现就是"音乐明明自带封面，App 里却显示没有"。
            if (savedUri != null) {
                try {
                    getContext().getContentResolver().update(
                            savedUri, new android.content.ContentValues(), null, null);
                } catch (Throwable ignored) { }
            }
            try {
                android.media.MediaScannerConnection.scanFile(
                        getContext(),
                        new String[] { tempFile.getAbsolutePath() },
                        new String[] { guessMime(fileName) },
                        null);
            } catch (Throwable ignored) { }

            // 4) 可选：同时落一个同名 .lrc（与音频用同一条落盘路径，否则会写不进去）
            if (saveLyricFile && lyricText != null && !lyricText.isEmpty()) {
                File lrc = new File(getContext().getCacheDir(), "hm_dl_" + System.currentTimeMillis() + ".lrc");
                try (FileOutputStream fos = new FileOutputStream(lrc)) {
                    fos.write(lyricText.getBytes("UTF-8"));
                }
                String lrcName = sanitizeFileName(name) + ".lrc";
                saveToDestination(treeUriString, lrc, lrcName);
                //noinspection ResultOfMethodCallIgnored
                lrc.delete();
            }

            notifyNext();
        } catch (Throwable error) {
            notifyError("downloadFailed");
        } finally {
            if (tempFile != null) {
                //noinspection ResultOfMethodCallIgnored
                tempFile.delete();
            }
            activeId = null;
        }
    }

    /** 下载到本地文件；返回是否成功。过程中发 progress 事件、响应暂停/取消。 */
    private boolean downloadToFile(String urlString, File target, String id) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlString);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", "HydrogenMusic/1.0 (Android)");
            conn.connect();

            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return false;

            long total = conn.getContentLengthLong();
            long read = 0;
            int lastPercent = -1;

            try (InputStream in = conn.getInputStream();
                 OutputStream out = new FileOutputStream(target)) {
                byte[] buffer = new byte[BUFFER_SIZE];
                int len;
                while ((len = in.read(buffer)) > 0) {
                    if (cancelRequested) return false;

                    // 暂停：原地等待（保持连接），直到 resume 或 cancel
                    while (pauseRequested && !cancelRequested) {
                        try { Thread.sleep(200); } catch (InterruptedException ignored) { }
                    }
                    if (cancelRequested) return false;

                    out.write(buffer, 0, len);
                    read += len;

                    if (total > 0) {
                        int percent = (int) Math.min(100, (read * 100 / total));
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            notifyProgress(id, percent);
                        }
                    }
                }
                out.flush();
            }
            notifyProgress(id, 100);
            return true;
        } catch (Throwable error) {
            return false;
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Throwable ignored) { }
            }
        }
    }

    /**
     * 统一的落盘入口：Android 10+ 走 MediaStore，低版本退回 SAF。
     * 侧车文件（封面/歌词）只关心成功与否，所以返回 boolean。
     */
    private boolean saveToDestination(String treeUriString, File source, String displayName) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return copyToMediaStoreDownloads(source, displayName) != null;
        }
        return copyToTree(treeUriString, source, displayName) == null;
    }

    /**
     * 写入系统公共「下载」目录（Android 10+）。
     *
     * 为什么用 MediaStore 而不是 SAF：
     *   SAF 要求用户先授权一个目录，而授权到不支持写入的 provider（实测第三方下载器的
     *   provider 能读不能写）时，会出现"选了目录却存不进去"。MediaStore.Downloads 直接写
     *   公共 Download 目录，不需要任何存储权限（Android 10+ 分区存储下由系统代管），
     *   行为稳定且可预期。
     *
     * @return 成功返回写入条目的 content URI；失败返回 null
     */
    private Uri copyToMediaStoreDownloads(File source, String displayName) {
        Uri collection = android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI;
        Uri item = null;
        try {
            android.content.ContentValues values = new android.content.ContentValues();
            values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, displayName);
            values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, guessMime(displayName));
            values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,
                    android.os.Environment.DIRECTORY_DOWNLOADS);
            values.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1);

            item = getContext().getContentResolver().insert(collection, values);
            if (item == null) return null;

            try (InputStream in = new java.io.FileInputStream(source)) {
                OutputStream out = getContext().getContentResolver().openOutputStream(item, "w");
                if (out == null) return null;
                try {
                    byte[] buffer = new byte[BUFFER_SIZE];
                    int len;
                    while ((len = in.read(buffer)) > 0) out.write(buffer, 0, len);
                    out.flush();
                } finally {
                    try { out.close(); } catch (Throwable ignored) { }
                }
            }

            // 清除 pending，文件才会对其它应用可见
            android.content.ContentValues done = new android.content.ContentValues();
            done.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0);
            getContext().getContentResolver().update(item, done, null, null);
            return item;
        } catch (Throwable error) {
            // 写入失败时清掉半成品，避免在下载目录里留下空文件
            try {
                if (item != null) getContext().getContentResolver().delete(item, null, null);
            } catch (Throwable ignored) { }
            return null;
        }
    }

    /** 把文件复制到 SAF 授权目录下的根（低版本回退路径）。失败时把真实原因带回去。 */
    private String copyToTree(String treeUriString, File source, String displayName) {
        try {
            Uri treeUri = Uri.parse(treeUriString);
            String rootDocId = DocumentsContract.getTreeDocumentId(treeUri);
            if (rootDocId == null) return "noRootDocId";

            Uri targetDir = DocumentsContract.buildDocumentUriUsingTree(treeUri, rootDocId);
            Uri created;
            try {
                created = DocumentsContract.createDocument(
                        getContext().getContentResolver(), targetDir, guessMime(displayName), displayName);
            } catch (Throwable error) {
                return "createDocument:" + error.getClass().getSimpleName() + ":" + error.getMessage();
            }
            if (created == null) return "createDocumentReturnedNull";

            try (InputStream in = new java.io.FileInputStream(source)) {
                OutputStream out = getContext().getContentResolver().openOutputStream(created, "w");
                if (out == null) return "openOutputStreamNull";
                try {
                    byte[] buffer = new byte[BUFFER_SIZE];
                    int len;
                    while ((len = in.read(buffer)) > 0) out.write(buffer, 0, len);
                    out.flush();
                } finally {
                    try { out.close(); } catch (Throwable ignored) { }
                }
            }
            return null;   // null = 成功
        } catch (Throwable error) {
            return "copy:" + error.getClass().getSimpleName() + ":" + error.getMessage();
        }
    }

    // ---------------------------------------------------------------- 事件

    private void notifyProgress(String id, int percent) {
        try {
            JSObject data = new JSObject();
            data.put("id", id);
            data.put("percent", percent);
            notifyListeners("downloadProgress", data, true);
        } catch (Throwable ignored) { }
    }

    private void notifyNext() {
        try {
            notifyListeners("downloadNext", new JSObject(), true);
        } catch (Throwable ignored) { }
    }

    private void notifyError(String code) {
        try {
            JSObject data = new JSObject();
            data.put("code", code);
            notifyListeners("downloadError", data, true);
        } catch (Throwable ignored) { }
    }

    // ---------------------------------------------------------------- 工具

    private String joinArtists(PluginCall call) {
        try {
            Object raw = call.getArray("artists") != null ? call.getArray("artists").toList() : null;
            if (raw instanceof java.util.List) {
                StringBuilder sb = new StringBuilder();
                for (Object one : (java.util.List<?>) raw) {
                    if (one == null) continue;
                    String value = String.valueOf(one).trim();
                    if (value.isEmpty()) continue;
                    if (sb.length() > 0) sb.append('/');
                    sb.append(value);
                }
                return sb.toString();
            }
        } catch (Throwable ignored) { }
        return call.getString("artists", "");
    }

    /** 前端传的 lyrics 是 { lrc, tlyric, romalrc } 结构，优先取 lrc。 */
    private String extractLyric(PluginCall call) {
        try {
            JSObject lyrics = call.getObject("lyrics");
            if (lyrics != null) {
                String lrc = lyrics.getString("lrc");
                if (lrc != null && !lrc.isEmpty()) return lrc;
            }
        } catch (Throwable ignored) { }
        return null;
    }

    private byte[] fetchBytes(String urlString) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(urlString).openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);
            conn.setInstanceFollowRedirects(true);
            conn.connect();
            if (conn.getResponseCode() < 200 || conn.getResponseCode() >= 300) return null;
            try (InputStream in = conn.getInputStream();
                 ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[16 * 1024];
                int len;
                while ((len = in.read(buffer)) > 0) bos.write(buffer, 0, len);
                return bos.toByteArray();
            }
        } catch (Throwable ignored) {
            return null;
        } finally {
            if (conn != null) { try { conn.disconnect(); } catch (Throwable ignored) { } }
        }
    }

    private String normalizeExt(String type) {
        if (type == null) return "mp3";
        String ext = type.toLowerCase(Locale.ROOT).trim();
        if (ext.startsWith(".")) ext = ext.substring(1);
        if (ext.isEmpty()) return "mp3";
        // 只保留字母数字，避免拼出非法文件名
        StringBuilder sb = new StringBuilder();
        for (char c : ext.toCharArray()) if (Character.isLetterOrDigit(c)) sb.append(c);
        return sb.length() == 0 ? "mp3" : sb.toString();
    }

    private String sanitizeFileName(String name) {
        if (name == null || name.trim().isEmpty()) return "未知歌曲";
        String cleaned = name.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_").trim();
        if (cleaned.length() > 80) cleaned = cleaned.substring(0, 80);
        return cleaned.isEmpty() ? "未知歌曲" : cleaned;
    }

    private String guessMime(String fileName) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".flac")) return "audio/flac";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".ogg")) return "audio/ogg";
        if (lower.endsWith(".opus")) return "audio/opus";
        if (lower.endsWith(".wma")) return "audio/x-ms-wma";
        if (lower.endsWith(".ape")) return "audio/x-ape";
        // 歌词：给 lrc 一个明确的 mime，别用 text/plain ——
        // 系统的 MimeTypeMap 把 text/plain 映射成 .txt，会让落盘文件变成
        // "xxx.lrc.txt"（实测）。
        if (lower.endsWith(".lrc")) return "application/lrc";
        return "application/octet-stream";
    }

    // ---------------------------------------------------------------- ID3v2.3 写入

    /**
     * 给 MP3 写入 ID3v2.3 标签（标题/歌手/专辑 + 内嵌封面）。
     *
     * 自己实现而不是引依赖：本工程不跑 cap sync，加 jaudiotagger 要走 Gradle 联网。
     * 只处理最常见的 v2.3 帧，写失败也不影响音频本身（调用处已 try/catch）。
     */
    private void writeId3v23(File mp3, String title, String artist, String album, byte[] cover) throws Exception {
        ByteArrayOutputStream frames = new ByteArrayOutputStream();

        if (title != null && !title.isEmpty()) frames.write(textFrame("TIT2", title));
        if (artist != null && !artist.isEmpty()) frames.write(textFrame("TPE1", artist));
        if (album != null && !album.isEmpty()) frames.write(textFrame("TALB", album));

        if (cover != null && cover.length > 0) {
            ByteArrayOutputStream pic = new ByteArrayOutputStream();
            pic.write(new byte[] { 0 });                       // 文本编码 ISO-8859-1
            pic.write("image/jpeg".getBytes("ISO-8859-1"));    // MIME
            pic.write(new byte[] { 0 });                       // 结束符
            pic.write(new byte[] { 3 });                       // 图片类型：封面
            pic.write(new byte[] { 0 });                       // 描述（空 + 结束符）
            pic.write(cover);
            frames.write(frame("APIC", pic.toByteArray()));
        }

        byte[] framesBytes = frames.toByteArray();
        int tagSize = framesBytes.length;

        ByteArrayOutputStream tag = new ByteArrayOutputStream();
        tag.write("ID3".getBytes("ISO-8859-1"));
        tag.write(new byte[] { 3, 0 });                        // v2.3.0
        tag.write(new byte[] { 0 });                           // flags
        tag.write(synchsafe(tagSize));
        tag.write(framesBytes);

        // 保留原音频数据，把新标签写在最前面（丢弃旧的 ID3v2 头）
        byte[] existing = readAll(mp3);
        int audioOffset = 0;
        if (existing.length > 10
                && existing[0] == 'I' && existing[1] == 'D' && existing[2] == '3') {
            int size = ((existing[6] & 0x7F) << 21) | ((existing[7] & 0x7F) << 14)
                    | ((existing[8] & 0x7F) << 7) | (existing[9] & 0x7F);
            audioOffset = 10 + size;
            if (audioOffset > existing.length) audioOffset = 0;
        }

        try (FileOutputStream out = new FileOutputStream(mp3)) {
            out.write(tag.toByteArray());
            out.write(existing, audioOffset, existing.length - audioOffset);
        }
    }

    private byte[] textFrame(String id, String value) throws Exception {
        byte[] utf16 = value.getBytes("UTF-16");       // 自带 BOM
        byte[] payload = new byte[1 + utf16.length];
        payload[0] = 1;                                // 文本编码：UTF-16（带 BOM）
        System.arraycopy(utf16, 0, payload, 1, utf16.length);
        return frame(id, payload);
    }

    private byte[] frame(String id, byte[] payload) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(id.getBytes("ISO-8859-1"));
        int size = payload.length;
        out.write((size >> 24) & 0xFF);
        out.write((size >> 16) & 0xFF);
        out.write((size >> 8) & 0xFF);
        out.write(size & 0xFF);
        out.write(new byte[] { 0, 0 });                // flags
        out.write(payload);
        return out.toByteArray();
    }

    private byte[] synchsafe(int size) {
        return new byte[] {
                (byte) ((size >> 21) & 0x7F),
                (byte) ((size >> 14) & 0x7F),
                (byte) ((size >> 7) & 0x7F),
                (byte) (size & 0x7F),
        };
    }

    private byte[] readAll(File file) throws Exception {
        try (RandomAccessFile raf = new RandomAccessFile(file, "r")) {
            byte[] data = new byte[(int) raf.length()];
            raf.readFully(data);
            return data;
        }
    }

    // ---------------------------------------------------------------- FLAC Vorbis Comment

    /**
     * 给 FLAC 写入 Vorbis Comment（TITLE/ARTIST/ALBUM + 内嵌封面 METADATA_BLOCK_PICTURE）。
     *
     * FLAC 的结构是：4 字节 "fLaC" + 若干 metadata block + 音频帧。
     * 第一个 block 必须是 STREAMINFO（type 0）。这里保留 STREAMINFO，
     * 在它之后插入一个 VORBIS_COMMENT（type 4）块，并正确设置
     * "是否最后一个 block" 标志位，音频数据原样接在后面 —— 不解码、不重编码。
     */
    private void writeFlacVorbisComment(File flac, String title, String artist, String album, byte[] cover) throws Exception {
        byte[] data = readAll(flac);
        if (data.length < 8) return;
        if (!(data[0] == 'f' && data[1] == 'L' && data[2] == 'a' && data[3] == 'C')) return;

        // 找到音频数据起点，并清掉原有的 comment / picture 块（保留 STREAMINFO 等）
        ByteArrayOutputStream keptBlocks = new ByteArrayOutputStream();
        int offset = 4;
        int audioOffset = data.length;
        while (offset + 4 <= data.length) {
            int header = data[offset] & 0xFF;
            boolean last = (header & 0x80) != 0;
            int type = header & 0x7F;
            int length = ((data[offset + 1] & 0xFF) << 16)
                    | ((data[offset + 2] & 0xFF) << 8)
                    | (data[offset + 3] & 0xFF);
            int blockEnd = offset + 4 + length;
            if (blockEnd > data.length) { audioOffset = data.length; break; }

            if (type != 4 && type != 6) {
                // 保留该块，但先清掉 last 标志（后面还要插 comment）
                byte[] block = new byte[4 + length];
                System.arraycopy(data, offset, block, 0, block.length);
                block[0] = (byte) type;
                keptBlocks.write(block);
            }
            offset = blockEnd;
            if (last) { audioOffset = blockEnd; break; }
        }

        // 构造 Vorbis Comment 载荷
        ByteArrayOutputStream payload = new ByteArrayOutputStream();
        byte[] vendor = "Hydrogen".getBytes("UTF-8");
        writeLeInt(payload, vendor.length);
        payload.write(vendor);
        java.util.List<String> comments = new java.util.ArrayList<>();
        if (title != null && !title.isEmpty()) comments.add("TITLE=" + title);
        if (artist != null && !artist.isEmpty()) comments.add("ARTIST=" + artist);
        if (album != null && !album.isEmpty()) comments.add("ALBUM=" + album);
        if (cover != null && cover.length > 0) comments.add("METADATA_BLOCK_PICTURE=" + buildFlacPictureBase64(cover));
        writeLeInt(payload, comments.size());
        for (String comment : comments) {
            byte[] bytes = comment.getBytes("UTF-8");
            writeLeInt(payload, bytes.length);
            payload.write(bytes);
        }
        byte[] commentBody = payload.toByteArray();

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write("fLaC".getBytes("ISO-8859-1"));
        byte[] kept = keptBlocks.toByteArray();
        if (kept.length > 0) out.write(kept, 0, kept.length);

        // Vorbis comment 块；若后面没有别的内容，它就是最后一个块
        out.write(0x80 | 4);                       // last=1, type=4
        out.write((commentBody.length >> 16) & 0xFF);
        out.write((commentBody.length >> 8) & 0xFF);
        out.write(commentBody.length & 0xFF);
        out.write(commentBody);

        // 音频帧原样接上
        out.write(data, audioOffset, data.length - audioOffset);

        try (FileOutputStream fos = new FileOutputStream(flac)) {
            fos.write(out.toByteArray());
        }
    }

    /** FLAC 的 METADATA_BLOCK_PICTURE：32 位大端字段 + 图片数据，再整体 base64。 */
    private String buildFlacPictureBase64(byte[] cover) throws Exception {
        ByteArrayOutputStream pic = new ByteArrayOutputStream();
        writeBeInt(pic, 3);                        // 图片类型：封面
        byte[] mime = "image/jpeg".getBytes("ISO-8859-1");
        writeBeInt(pic, mime.length);
        pic.write(mime);
        writeBeInt(pic, 0);                        // 描述长度 0
        writeBeInt(pic, 0);                        // 宽（未知）
        writeBeInt(pic, 0);                        // 高
        writeBeInt(pic, 0);                        // 色深
        writeBeInt(pic, 0);                        // 索引色数
        writeBeInt(pic, cover.length);
        pic.write(cover);
        return Base64.encodeToString(pic.toByteArray(), Base64.NO_WRAP);
    }

    private void writeLeInt(ByteArrayOutputStream out, int value) {
        out.write(value & 0xFF);
        out.write((value >> 8) & 0xFF);
        out.write((value >> 16) & 0xFF);
        out.write((value >> 24) & 0xFF);
    }

    private void writeBeInt(ByteArrayOutputStream out, int value) {
        out.write((value >> 24) & 0xFF);
        out.write((value >> 16) & 0xFF);
        out.write((value >> 8) & 0xFF);
        out.write(value & 0xFF);
    }
}
