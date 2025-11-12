import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

export default function WebRouteRedirect() {
  const router = useRouter();
  const { url, web } = useLocalSearchParams<{ url?: string; web?: string }>();

  React.useEffect(() => {
    (async () => {
      const target = typeof url === 'string' ? url : '';
      const payloadRaw = typeof web === 'string' ? web : '';
      if (target) {
        router.replace({ pathname: '/webview-view', params: { url: target } });
        return;
      }
      if (payloadRaw) {
        let payload = payloadRaw;
        try { payload = decodeURIComponent(payloadRaw); } catch {}
        try {
          const { eventBus } = await import('@/lib/event-bus');
          // eslint-disable-next-line no-console
          console.log('[DL][route-web] deliver web payload only');
          (eventBus as any).emit('DEEPLINK_WEB', { payload });
        } catch {}
        router.replace('/(tabs)');
        return;
      }
      router.replace('/(tabs)');
    })();
  }, [router, url, web]);

  return <View />;
}


