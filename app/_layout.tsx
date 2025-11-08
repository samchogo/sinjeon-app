import { getApps } from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
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
            if (target && !/^https?:\/\//i.test(target)) {
              const base = String((Constants.expoConfig?.extra as any)?.WEBVIEW_URL || '');
              const baseTrim = base.replace(/\/+$/, '');
              const rel = target.replace(/^\/+/, '');
              target = `${baseTrim}/${rel}`;
            }
            if (target) {
              router.push({ pathname: '/webview-view', params: { url: target } });
            }
          }
        }
      } catch {}
    };

    (async () => {
      // keep splash briefly for UX consistency, then hide
      await new Promise((r) => setTimeout(r, 1000));
      try { await SplashScreen.hideAsync(); } catch {}

      // After splash: request PUSH then LOCATION sequentially
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

      // Small delay to avoid overlapping OS dialogs
      await new Promise((r) => setTimeout(r, 400));

      try {
        const fg = await Location.getForegroundPermissionsAsync();
        if (fg.status !== 'granted') {
          await Location.requestForegroundPermissionsAsync().catch(() => undefined);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('[LOCATION][perm] error', (e as any)?.message);
      }
    })();

    const sub = Linking.addEventListener('url', ({ url }) => openWeb(url));
    Linking.getInitialURL().then((url) => openWeb(url));
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
