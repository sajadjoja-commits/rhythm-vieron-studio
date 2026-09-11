import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vireon.ai',
  appName: 'Vireon AI Studio',
  webDir: 'dist',
  backgroundColor: '#090d16',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      backgroundColor: '#090d16',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#090d16',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
    CapacitorUpdater: {
      appId: '4ff5064c-bd8c-4b62-b998-25e5da1d59c5',
      // Android does not load the deployed web site. It loads the bundle inside
      // the APK, so OTA must be enabled to receive web-only releases.
      // Download while the app is open and activate the verified bundle on the
      // next launch. This avoids interrupting an edit/export in progress.
      autoUpdate: 'atBackground',
      periodCheckDelay: 3600,
      responseTimeout: 20,
      defaultChannel: 'staging',
    },
  },
};

export default config;

