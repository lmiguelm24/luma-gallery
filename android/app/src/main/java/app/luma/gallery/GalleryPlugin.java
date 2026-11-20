package app.luma.gallery;

import android.Manifest;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.ContentObserver;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Size;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "Gallery", permissions = {
    @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
    @Permission(alias = "images", strings = { Manifest.permission.READ_MEDIA_IMAGES }),
    @Permission(alias = "videos", strings = { Manifest.permission.READ_MEDIA_VIDEO }),
    @Permission(alias = "selected", strings = { Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED })
})
public class GalleryPlugin extends Plugin {
    private final ExecutorService queries = Executors.newSingleThreadExecutor();
    private final ExecutorService thumbnails = Executors.newFixedThreadPool(2);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ContentObserver observer;
    private final Runnable changed = () -> notifyListeners("libraryChanged", new JSObject());

    @Override
    public void load() {
        observer = new ContentObserver(handler) {
            @Override
            public void onChange(boolean selfChange) {
                handler.removeCallbacks(changed);
                handler.postDelayed(changed, 800);
            }
        };
        getContext().getContentResolver().registerContentObserver(MediaStore.AUTHORITY_URI, true, observer);
    }

    @Override
    protected void handleOnResume() {
        handler.removeCallbacks(changed);
        handler.postDelayed(changed, 300);
    }

    @Override
    protected void handleOnDestroy() {
        if (observer != null) getContext().getContentResolver().unregisterContentObserver(observer);
        handler.removeCallbacks(changed);
        queries.shutdownNow();
        thumbnails.shutdownNow();
    }

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject accessState() {
        boolean images;
        boolean videos;
        boolean limited = false;
        if (Build.VERSION.SDK_INT >= 33) {
            images = granted(Manifest.permission.READ_MEDIA_IMAGES);
            videos = granted(Manifest.permission.READ_MEDIA_VIDEO);
            if (Build.VERSION.SDK_INT >= 34) {
                limited = granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) && !(images && videos);
            }
        } else {
            images = videos = granted(Manifest.permission.READ_EXTERNAL_STORAGE);
        }
        JSObject result = new JSObject();
        result.put("images", images);
        result.put("videos", videos);
        result.put("limited", limited);
        return result;
    }

    @PluginMethod
    public void access(PluginCall call) { call.resolve(accessState()); }

    @PluginMethod
    public void minimize(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().moveTaskToBack(true);
            call.resolve();
        });
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 34) {
                requestPermissionForAliases(new String[]{"images", "videos", "selected"}, call, "accessResult");
            } else if (Build.VERSION.SDK_INT >= 33) {
                requestPermissionForAliases(new String[]{"images", "videos"}, call, "accessResult");
            } else {
                requestPermissionForAlias("storage", call, "accessResult");
            }
        });
    }

    @PermissionCallback
    private void accessResult(PluginCall call) { call.resolve(accessState()); }

    @PluginMethod
    public void openSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent);
                call.resolve();
            } catch (Exception exception) { call.reject("No se pudieron abrir los ajustes", exception); }
        });
    }

    @PluginMethod
    public void list(PluginCall call) {
        final int offset = Math.max(0, call.getInt("offset", 0));
        final int limit = Math.min(500, Math.max(1, call.getInt("limit", 300)));
        queries.execute(() -> {
            try {
                JSObject state = accessState();
                if (!state.getBoolean("images", false) && !state.getBoolean("videos", false) && !state.getBoolean("limited", false)) {
                    call.reject("Se necesita permiso para leer la galería", "PERMISSION_DENIED");
                    return;
                }
                Uri collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL);
                String[] projection = {
                    MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
                    MediaStore.MediaColumns.MIME_TYPE, MediaStore.MediaColumns.SIZE,
                    MediaStore.MediaColumns.DATE_MODIFIED, MediaStore.MediaColumns.WIDTH,
                    MediaStore.MediaColumns.HEIGHT, MediaStore.MediaColumns.DURATION,
                    MediaStore.Images.ImageColumns.BUCKET_DISPLAY_NAME,
                    MediaStore.Files.FileColumns.MEDIA_TYPE
                };
                String selection = "(" + MediaStore.Files.FileColumns.MEDIA_TYPE + "=? OR " +
                    MediaStore.Files.FileColumns.MEDIA_TYPE + "=?) AND " + MediaStore.MediaColumns.IS_PENDING + "=0";
                if (Build.VERSION.SDK_INT >= 30) selection += " AND " + MediaStore.MediaColumns.IS_TRASHED + "=0";
                Bundle args = new Bundle();
                args.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection);
                args.putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, new String[]{
                    String.valueOf(MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE),
                    String.valueOf(MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO)
                });
                args.putStringArray(ContentResolver.QUERY_ARG_SORT_COLUMNS, new String[]{
                    MediaStore.MediaColumns.DATE_MODIFIED, MediaStore.MediaColumns._ID
                });
                args.putInt(ContentResolver.QUERY_ARG_SORT_DIRECTION, ContentResolver.QUERY_SORT_DIRECTION_DESCENDING);
                args.putInt(ContentResolver.QUERY_ARG_LIMIT, limit + 1);
                args.putInt(ContentResolver.QUERY_ARG_OFFSET, offset);
                JSArray items = new JSArray();
                boolean hasMore = false;
                try (Cursor cursor = getContext().getContentResolver().query(collection, projection, args, null)) {
                    if (cursor != null) {
                        while (cursor.moveToNext()) {
                            if (items.length() >= limit) { hasMore = true; break; }
                            long id = cursor.getLong(0);
                            boolean video = cursor.getInt(9) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO;
                            Uri base = video ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
                                : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL);
                            JSObject item = new JSObject();
                            item.put("id", "android:" + (video ? "video:" : "image:") + id);
                            item.put("uri", ContentUris.withAppendedId(base, id).toString());
                            item.put("name", cursor.isNull(1) ? "Archivo " + id : cursor.getString(1));
                            item.put("type", cursor.isNull(2) ? (video ? "video/mp4" : "image/jpeg") : cursor.getString(2));
                            item.put("size", cursor.getLong(3));
                            item.put("date", cursor.getLong(4) * 1000L);
                            item.put("width", cursor.getInt(5));
                            item.put("height", cursor.getInt(6));
                            item.put("duration", cursor.getLong(7));
                            item.put("album", cursor.isNull(8) ? "Sin álbum" : cursor.getString(8));
                            item.put("kind", video ? "video" : "image");
                            items.put(item);
                        }
                    }
                }
                JSObject result = new JSObject();
                result.put("items", items);
                result.put("hasMore", hasMore);
                call.resolve(result);
            } catch (Exception exception) { call.reject("No se pudo consultar MediaStore", exception); }
        });
    }

    private Uri mediaUri(PluginCall call) {
        String value = call.getString("uri", "");
        Uri uri = Uri.parse(value);
        if (!"content".equals(uri.getScheme()) || !"media".equals(uri.getAuthority())) {
            throw new IllegalArgumentException("URI de galería inválida");
        }
        return uri;
    }

    @PluginMethod
    public void thumbnail(PluginCall call) {
        thumbnails.execute(() -> {
            try {
                Bitmap bitmap = getContext().getContentResolver().loadThumbnail(mediaUri(call), new Size(384, 384), null);
                try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 78, output);
                    JSObject result = new JSObject();
                    result.put("data", "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                    call.resolve(result);
                } finally { bitmap.recycle(); }
            } catch (Exception exception) { call.reject("Miniatura no disponible", exception); }
        });
    }

    @PluginMethod
    public void saveImage(PluginCall call) {
        queries.execute(() -> {
            Uri destination = null;
            boolean finished = false;
            ContentResolver resolver = getContext().getContentResolver();
            try {
                String data = call.getString("data", "");
                String mime = call.getString("mime", "image/jpeg");
                if (data.isEmpty() || data.length() > 24_000_000) throw new IllegalArgumentException("La copia es demasiado grande");
                if (!"image/jpeg".equals(mime) && !"image/png".equals(mime)) throw new IllegalArgumentException("Formato no compatible");
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || !mime.equals(bounds.outMimeType)) {
                    throw new IllegalArgumentException("Los datos no corresponden a una imagen válida");
                }
                String extension = "image/png".equals(mime) ? ".png" : ".jpg";
                String name = call.getString("name", "foto-luma-" + System.currentTimeMillis() + extension)
                    .replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "-");
                if (name.length() > 150) name = name.substring(0, 140) + extension;
                if (!name.toLowerCase(java.util.Locale.ROOT).endsWith(extension)) name += extension;
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Luma");
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                destination = resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
                if (destination == null) throw new IllegalStateException("Android no pudo crear la copia");
                try (OutputStream output = resolver.openOutputStream(destination, "w")) {
                    if (output == null) throw new IllegalStateException("No se pudo abrir el archivo de destino");
                    output.write(bytes);
                }
                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                if (resolver.update(destination, values, null, null) < 1) throw new IllegalStateException("No se pudo finalizar la copia");
                finished = true;
                JSObject item = new JSObject();
                item.put("id", "android:image:" + ContentUris.parseId(destination));
                item.put("uri", destination.toString());
                item.put("name", name);
                item.put("type", mime);
                item.put("kind", "image");
                item.put("size", bytes.length);
                item.put("date", System.currentTimeMillis());
                item.put("width", bounds.outWidth);
                item.put("height", bounds.outHeight);
                item.put("album", "Luma");
                call.resolve(item);
            } catch (Exception exception) { call.reject("No se pudo guardar la copia en Imágenes/Luma", exception); }
            finally {
                if (!finished && destination != null) {
                    try { resolver.delete(destination, null, null); } catch (Exception ignored) { }
                }
            }
        });
    }

    @PluginMethod
    public void share(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Uri uri = mediaUri(call);
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType(getContext().getContentResolver().getType(uri));
                intent.putExtra(Intent.EXTRA_STREAM, uri);
                intent.setClipData(ClipData.newRawUri("Archivo de Luma", uri));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().startActivity(Intent.createChooser(intent, "Compartir con"));
                call.resolve();
            } catch (Exception exception) { call.reject("No se pudo compartir", exception); }
        });
    }
}
