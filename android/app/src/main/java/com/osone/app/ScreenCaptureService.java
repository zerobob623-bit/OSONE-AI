package com.osone.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.view.WindowManager;

public class ScreenCaptureService extends Service {
    public static final String RESULT_CODE = "projection_result_code";
    public static final String RESULT_DATA = "projection_result_data";
    private static final String CHANNEL = "osone_screen_control";
    private MediaProjection projection;
    private ImageReader imageReader;
    private VirtualDisplay virtualDisplay;

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(
            new NotificationChannel(CHANNEL, "Controle de tela OSONE", NotificationManager.IMPORTANCE_LOW));
        Intent stop = new Intent(this, ScreenCaptureService.class).setAction("STOP");
        PendingIntent stopIntent = PendingIntent.getService(this, 1, stop,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentTitle("OSONE está compartilhando a tela")
            .setContentText("Toque em Parar para encerrar imediatamente")
            .addAction(new Notification.Action.Builder(null, "Parar", stopIntent).build())
            .setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(73, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        else startForeground(73, notification);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || "STOP".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        int result = intent.getIntExtra(RESULT_CODE, Activity.RESULT_CANCELED);
        Intent data = intent.getParcelableExtra(RESULT_DATA);
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        projection = manager.getMediaProjection(result, data);
        DisplayMetrics metrics = new DisplayMetrics();
        ((WindowManager) getSystemService(WINDOW_SERVICE)).getDefaultDisplay().getRealMetrics(metrics);
        imageReader = ImageReader.newInstance(metrics.widthPixels, metrics.heightPixels, PixelFormat.RGBA_8888, 2);
        virtualDisplay = projection.createVirtualDisplay("OSONE-current-screen",
            metrics.widthPixels, metrics.heightPixels, metrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.getSurface(), null, null);
        return START_NOT_STICKY;
    }
    @Override public void onDestroy() {
        if (virtualDisplay != null) virtualDisplay.release();
        if (imageReader != null) imageReader.close();
        if (projection != null) projection.stop();
        virtualDisplay = null; imageReader = null; projection = null;
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
