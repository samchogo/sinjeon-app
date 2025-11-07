import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
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
    // Hide splash after a delay (e.g., 3 seconds) for testing
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 3000);

    const openWeb = (u?: string | null) => {
      if (!u) return;
      try {
        const parsed: any = Linking.parse(u);
        if (parsed?.scheme === 'sulbingapp' && parsed?.path === 'web') {
          const q = parsed?.queryParams || {};
          let target = q?.url ? String(q.url) : '';
          if (target && !/^https?:\/\//i.test(target)) {
            const base = String((Constants.expoConfig?.extra as any)?.WEBVIEW_URL || '');
            const baseTrim = base.replace(/\/+$/,'');
            const rel = target.replace(/^\/+/, '');
            target = `${baseTrim}/${rel}`;
          }
          if (target) {
            router.push({ pathname: '/webview-view', params: { url: target } });
          }
        }
      } catch {}
    };

    const sub = Linking.addEventListener('url', ({ url }) => openWeb(url));
    Linking.getInitialURL().then((url) => openWeb(url));
    return () => { clearTimeout(timer); sub.remove(); };
  }, [router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="webview-view" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
