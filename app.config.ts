import type { ConfigContext, ExpoConfig } from '@expo/config';
import 'dotenv/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const APP_VARIANT = process.env.APP_VARIANT ?? 'dev'; // dev | prod

  const ANDROID_PACKAGE =
    process.env.ANDROID_PACKAGE ??
    (APP_VARIANT === 'prod' ? 'com.sulbing.mobile.app' : 'com.sulbing.mobile.app.dev');

  const IOS_BUNDLE_ID =
    process.env.IOS_BUNDLE_ID ??
    (APP_VARIANT === 'prod' ? 'com.sulbing.mobile.app' : 'com.sulbing.mobile.app.dev');

  // Credential file paths (override via ANDROID_GOOGLE_SERVICES_FILE / IOS_GOOGLE_SERVICES_FILE)
  const ANDROID_GOOGLE_SERVICES_FILE =
    process.env.ANDROID_GOOGLE_SERVICES_FILE ??
    (APP_VARIANT === 'prod'
      ? './credentials/google-services.json'
      : './credentials/google-services-dev.json');

  const IOS_GOOGLE_SERVICES_FILE =
    process.env.IOS_GOOGLE_SERVICES_FILE ??
    (APP_VARIANT === 'prod'
      ? './credentials/GoogleService-Info.plist'
      : './credentials/GoogleService-Info-dev.plist');

  // WebView URL per variant (override via env)
  const WEBVIEW_URL =
    process.env.EXPO_PUBLIC_WEBVIEW_URL ??
    (APP_VARIANT === 'prod'
      ? 'https://sapp.sulbing.com/'
      : 'https://namp.me/test/react');

  return {
    ...config,
    name: 'sulbing-app',
    slug: 'sulbing-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'sulbingapp',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      bundleIdentifier: IOS_BUNDLE_ID,
      supportsTablet: true,
      googleServicesFile: IOS_GOOGLE_SERVICES_FILE,
      infoPlist: {
        NSCameraUsageDescription: '바코드 스캔을 위해 카메라 접근 권한이 필요합니다.',
        NSContactsUsageDescription: '주소록에서 연락처를 선택하기 위해 접근 권한이 필요합니다.',
        LSApplicationQueriesSchemes: [
          'ispmobile',
          'kb-acp',
          'liivbank',
          'newliiv',
          'kbbank',
          'shinhan-sr-ansimclick',
          'shinhan-sr-ansimclick-lpay',
          'shinhan-sr-ansimclick-naverpay',
          'shinhan-sr-ansimclick-payco',
          'smshinhanansimclick',
          'travelwallet',
          'nhallonepayansimclick',
          'npappcardansimclick',
          'nonghyupcardansimclick',
          'lottesmartpay',
          'lotteappcard',
          'mpocket.online.ansimclick',
          'cloudpay',
          'hanawalletmembers',
          'hdcardappcardansimclick',
          'smhyndaiansimclick',
          'com.wooricard.wcard',
          'newsmartpib',
          'citimobileapp',
          'citicardappkr',
          'samsungpay',
          'naversearchthirdlogin',
          'kakaotalk',
          'payco',
          'lpayapp',
          'shinsegaeeaypayment',
          'supertoss',
          'kftc-bankpay',
          'tmoney',
          'appfree',
          'mvaccinestart',
          'vguardstart',
          'v3mobileplusweb',
          'tauthlink',
          'ktauthexternalcall',
          'upluscorpoation',
          'monimopay',
          'monimopayauth',
        ],
      },
    },
    android: {
      package: ANDROID_PACKAGE,
      googleServicesFile: ANDROID_GOOGLE_SERVICES_FILE,
      notification: {
        icon: './assets/images/notification-icon.png',
        color: '#863534',
      },
      adaptiveIcon: {
        backgroundColor: '#863534',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-image.png',
          imageWidth: 220,
          resizeMode: 'contain',
          backgroundColor: '#863534',
          dark: { backgroundColor: '#863534' },
        },
      ],
      'expo-barcode-scanner',
      './plugins/android-queries-plugin',
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      ...(config.extra ?? {}),
      APP_VARIANT,
      WEBVIEW_URL,
    },
  };
};


