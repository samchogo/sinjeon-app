import { getApps } from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

// Keep splash on screen for testing (temporary). Call as early as possible.
// eslint-disable-next-line @typescript-eslint/no-floating-promises
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const brandBg = '#863534';
  const baseWebUrl = String((Constants.expoConfig?.extra as any)?.WEBVIEW_URL || '');
  const allowedHost = React.useMemo(() => {
    try { return new URL(baseWebUrl).host.toLowerCase(); } catch { return ''; }
  }, [baseWebUrl]);
  const lightTheme = React.useMemo(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        background: brandBg,
        card: brandBg,
      },
    }),
    [brandBg]
  );
  const darkTheme = React.useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: brandBg,
        card: brandBg,
      },
    }),
    [brandBg]
  );
  const router = useRouter();

  React.useEffect(() => {
    // Warm up RNFirebase modules early to avoid on-demand bundling on first token request
    try {
      const apps = getApps?.() || [];
      // eslint-disable-next-line no-console
      console.log('[RNFB][root] apps at start:', apps.map((a: any) => a?.name));
    } catch {}
    (async () => {
      try {
        await messaging().setAutoInitEnabled(true);
        // Touch a property to ensure module initialization
        try {
          // Prefer method form to avoid deprecation warning
          // @ts-ignore
          await messaging().isDeviceRegisteredForRemoteMessages?.();
        } catch {
          // fallback read without crashing
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          (messaging() as any).isDeviceRegisteredForRemoteMessages;
        }
      } catch {}
    })();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const openWeb = (u?: string | null) => {
      if (!u) return;
      try {
        const parsed: any = Linking.parse(u);
        if (parsed?.scheme === 'sulbingapp') {
          const rawPath = String(parsed?.path || '');
          // Root form with query only: sulbingapp://?web=... or ?url=... or ?data=...
          if (!rawPath) {
            const q = parsed?.queryParams || {};
            const webQ = q?.web ? String(q.web) : '';
            const urlQ = q?.url ? String(q.url) : '';
            // Prefer web, then url
            const cand = webQ || urlQ;
            if (cand) {
              (async () => {
                try {
                  const { eventBus } = await import('@/lib/event-bus');
                  // eslint-disable-next-line no-console
                  console.log('[DL] deliver web payload only (root form)');
                  (eventBus as any).emit('DEEPLINK_WEB', { payload: cand });
                } catch {}
              })();
              return;
            }
            // Generic data passthrough
            if (q?.data) {
              let payload = String(q.data);
              // attempt parse → re-stringify to keep JSON shape when needed
              try { const obj = JSON.parse(payload); payload = JSON.stringify(obj); } catch {}
              (async () => {
                try {
                  const { eventBus } = await import('@/lib/event-bus');
                  // eslint-disable-next-line no-console
                  console.log('[DL] deliver data payload (root form)');
                  (eventBus as any).emit('DEEPLINK_WEB', { payload });
                } catch {}
              })();
              return;
            }
          }
          // Support payload-only form: sulbingapp://web=<payload>
          if (/^web=/i.test(rawPath)) {
            const payloadEnc = rawPath.slice(4);
            let payload = payloadEnc;
            try { payload = decodeURIComponent(payloadEnc); } catch {}
            (async () => {
              try {
                const { eventBus } = await import('@/lib/event-bus');
                // eslint-disable-next-line no-console
                console.log('[DL] deliver web payload only (path form)');
                (eventBus as any).emit('DEEPLINK_WEB', { payload });
              } catch {}
            })();
            return;
          }
          // test push deep link: sulbingapp://push?data=<json or kv>
          if (parsed?.path === 'push' || parsed?.path === 'test_push') {
            (async () => {
              try {
                const q = parsed?.queryParams || {};
                let payload: any = {};
                if (q?.data) {
                  try { payload = JSON.parse(String(q.data)); } catch { payload = { data: String(q.data) }; }
                } else {
                  payload = { ...q };
                }
                const { eventBus } = await import('@/lib/event-bus');
                // eslint-disable-next-line no-console
                console.log('[PUSH][root][deeplink]', payload);
                eventBus.emit('PUSH_CLICKED', { payload });
              } catch {}
            })();
            return;
          }
          if (parsed?.path === 'web') {
            const q = parsed?.queryParams || {};
            let target = q?.url ? String(q.url) : '';
            const webPayload = q?.web ? String(q.web) : '';
            // If web payload is provided, do not redirect; only notify WebView to handle it
            if (webPayload) {
              (async () => {
                try {
                  const { eventBus } = await import('@/lib/event-bus');
                  // eslint-disable-next-line no-console
                  console.log('[DL] deliver web payload only');
                  (eventBus as any).emit('DEEPLINK_WEB', { payload: webPayload });
                } catch {}
              })();
              return;
            }
            // Treat url= same as payload injection (no new screen)
            if (target) {
              // Map relative to absolute within allowed host
              if (!/^https?:\/\//i.test(target)) {
                const base = String((Constants.expoConfig?.extra as any)?.WEBVIEW_URL || '');
                const baseTrim = base.replace(/\/+$/, '');
                const rel = target.replace(/^\/+/, '');
                target = `${baseTrim}/${rel}`;
              }
              try {
                if (allowedHost) {
                  const host = new URL(target).host.toLowerCase();
                  if (host !== allowedHost) {
                    // eslint-disable-next-line no-console
                    console.log('[DL] blocked by host filter', { targetHost: host, allowedHost });
                    return;
                  }
                }
              } catch {}
              (async () => {
                try {
                  const { eventBus } = await import('@/lib/event-bus');
                  // eslint-disable-next-line no-console
                  console.log('[DL] deliver web url payload (no route)', target);
                  (eventBus as any).emit('DEEPLINK_WEB', { payload: target });
                } catch {}
              })();
              return;
            }
          }
        }
      } catch {}
    };

    const sub = Linking.addEventListener('url', ({ url }) => openWeb(url));
    (async () => {
      // Process initial URL first, then hide splash to avoid flicker/missed routing
      try {
        const initialUrl = await Linking.getInitialURL().catch(() => null);
        openWeb(initialUrl || undefined);
      } catch {}
      try { await SplashScreen.hideAsync(); } catch {}

      // After splash: request PUSH then LOCATION sequentially (non-blocking for UI)
      try {
        if (Platform.OS === 'android') {
          if (Platform.Version >= 33) {
            const has = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => false);
            if (!has) {
              await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => null);
            }
          }
        } else {
          try {
            await messaging().setAutoInitEnabled(true);
            await messaging().requestPermission().catch(() => undefined);
            try { await messaging().registerDeviceForRemoteMessages(); } catch {}
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log('[PUSH][iOS] request error', (e as any)?.message);
          }
        }
      } catch {}

      // Location permission prompts will occur on-demand from WebView requests only
    })();
    return () => { cancelled = true; sub.remove(); };
  }, [router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="webview-view" options={{ headerShown: false }} />
        <Stack.Screen name="barcode-scan" options={{ headerShown: false }} />
        <Stack.Screen
          name="contact-pick"
          options={{
            title: '연락처 선택',
            headerBackTitle: '',
            // Show only chevron without any text on iOS
            headerBackButtonDisplayMode: 'minimal',
            headerTitleAlign: 'center',
          }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
