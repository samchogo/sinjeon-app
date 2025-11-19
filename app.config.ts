import type { ConfigContext, ExpoConfig } from '@expo/config';
import 'dotenv/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const APP_VARIANT = process.env.APP_VARIANT ?? 'dev'; // dev | prod

  const ANDROID_PACKAGE =
    process.env.ANDROID_PACKAGE ??
    (APP_VARIANT === 'prod' ? 'kr.co.sinjeon.app' : 'kr.co.sinjeon.app.dev');

  const IOS_BUNDLE_ID =
    process.env.IOS_BUNDLE_ID ??
    (APP_VARIANT === 'prod' ? 'kr.co.sinjeon.app' : 'kr.co.sinjeon.app.dev');

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
      ? 'https://app.sinjeon.co.kr'
      : 'https://dev.d219rtrkrebb73.amplifyapp.com');
    // (APP_VARIANT === 'prod'
    //   ? 'https://sapp.sinjeon.com'
    //   : 'http://192.168.103.25:3000');

  return {
    ...config,
    name: APP_VARIANT === 'prod' ? '신전떡볶이' : '신전떡볶이 Dev',
    slug: 'sinjeon-app',
    version: '1.0.3',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'sinjeonapp',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      bundleIdentifier: IOS_BUNDLE_ID,
      supportsTablet: false,
      icon: './assets/images/icon.png',
      googleServicesFile: IOS_GOOGLE_SERVICES_FILE,
      buildNumber: '1000',
      entitlements: { 'aps-environment': 'development' },
      infoPlist: {
        CFBundleDisplayName: APP_VARIANT === 'prod' ? '신전떡볶이' : '신전떡볶이 Dev',
        NSCameraUsageDescription: '바코드 스캔을 위해 카메라 접근 권한이 필요합니다.',
        NSContactsUsageDescription: '주소록에서 연락처를 선택하기 위해 접근 권한이 필요합니다.',
        NSPhotoLibraryUsageDescription: '사진을 선택하기 위해 사진 라이브러리 접근 권한이 필요합니다.',
        NSLocationWhenInUseUsageDescription: '서비스 제공을 위해 앱 사용 중 위치 접근 권한이 필요합니다.',
        ITSAppUsesNonExemptEncryption: false,
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
          'upluscorporation',
          'monimopay',
          'monimopayauth',
        ],
      },
    },
    android: {  
      package: ANDROID_PACKAGE,
      googleServicesFile: ANDROID_GOOGLE_SERVICES_FILE,
      versionCode: 1001,
      adaptiveIcon: {
        backgroundColor: '#FF8CB4',
        foregroundImage: './assets/images/icon.png',
        monochromeImage: './assets/images/icon.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    notification: {
      icon: './assets/images/notification-icon.png',
      color: '#863534',
    },
    plugins: [
      'expo-router',
             '@react-native-firebase/app',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-image.png',
          imageWidth: 95,
          resizeMode: 'contain',
          backgroundColor: '#FFFFFF',
          dark: { backgroundColor: '#FFFFFF' },
        },
      ],
      [
        'expo-build-properties',
        { ios: { newArchEnabled: true, deploymentTarget: '15.1', useModularHeaders: true } },
      ],
      './plugins/ios-modular-headers',
      './plugins/ios-nonmodular-fix',
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
      // Toggle for showing offline UI (overlay/alerts) when network is unreachable
      // Can be overridden via EXPO_PUBLIC_OFFLINE_UI_ENABLED = 'true' | 'false'
      OFFLINE_UI_ENABLED: (() => {
        try {
          const v = String(process.env.EXPO_PUBLIC_OFFLINE_UI_ENABLED ?? 'false').toLowerCase();
          return v === '1' || v === 'true' || v === 'yes';
        } catch {
          return true;
        }
      })(),
    },
  };
};


