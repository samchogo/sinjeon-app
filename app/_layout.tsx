import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  React.useEffect(() => {
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
    return () => sub.remove();
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
