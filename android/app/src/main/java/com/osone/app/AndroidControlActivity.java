package com.osone.app;

import android.Manifest;
import android.accessibilityservice.AccessibilityService;
import android.app.Activity;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class AndroidControlActivity extends Activity {
    private static final int CAPTURE_REQUEST = 7001;
    private TextView status;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(48, 64, 48, 48);
        status = new TextView(this);
        status.setTextSize(18); panel.addView(status);
        panel.addView(button("Habilitar Acessibilidade", v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))));
        panel.addView(button("Compartilhar tela", v -> requestCapture()));
        panel.addView(button("Parar compartilhamento", v -> stopService(new Intent(this, ScreenCaptureService.class))));
        panel.addView(button("Testar Voltar", v -> OsoneAccessibilityService.global(AccessibilityService.GLOBAL_ACTION_BACK)));
        panel.addView(button("Testar Início", v -> OsoneAccessibilityService.global(AccessibilityService.GLOBAL_ACTION_HOME)));
        panel.addView(button("Abrir OSONE", v -> startActivity(new Intent(this, LauncherActivity.class))));
        setContentView(panel);
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7002);
    }

    @Override protected void onResume() { super.onResume(); updateStatus(); }
    private Button button(String text, View.OnClickListener listener) {
        Button button = new Button(this); button.setText(text); button.setOnClickListener(listener); return button;
    }
    private void updateStatus() {
        status.setText(OsoneAccessibilityService.isEnabled()
            ? "Controle Android habilitado\nA tela só é capturada após sua confirmação."
            : "Acessibilidade desativada\nO Android exige ativação manual nas Configurações.");
    }
    private void requestCapture() {
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        startActivityForResult(manager.createScreenCaptureIntent(), CAPTURE_REQUEST);
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != CAPTURE_REQUEST || resultCode != RESULT_OK || data == null) return;
        Intent service = new Intent(this, ScreenCaptureService.class)
            .putExtra(ScreenCaptureService.RESULT_CODE, resultCode)
            .putExtra(ScreenCaptureService.RESULT_DATA, data);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(service); else startService(service);
    }
}
