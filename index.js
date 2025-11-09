import { eventBus } from '@/lib/event-bus';
import 'expo-router/entry';
import { Platform } from 'react-native';
console.log('[INDEX] loaded, Platform=', Platform.OS);
// Set background handler only when native Firebase module is available (dev build / production app)
if (Platform.OS !== 'web') {
  (async () => {
    try {
      const messaging = (await import('@react-native-firebase/messaging')).default;
      messaging().setBackgroundMessageHandler(async (remoteMessage) => {
        // customize if needed
      });

      // When app opened from background by tapping a notification
      messaging().onNotificationOpenedApp((remoteMessage) => {
        try {
          const payload = remoteMessage?.data ?? remoteMessage ?? {};
          // eslint-disable-next-line no-console
          console.log('[PUSH][root][opened]', payload);
          try { global.__PUSH_CLICKED_LAST = payload; } catch {}
          eventBus.emit('PUSH_CLICKED', { payload });
        } catch {}
      });

      // When app opened from quit by tapping a notification
      const initial = await messaging().getInitialNotification();
      if (initial) {
        setTimeout(() => {
          try {
            const payload = initial?.data ?? initial ?? {};
            // eslint-disable-next-line no-console
            console.log('[PUSH][root][initial]', payload);
            try { global.__PUSH_CLICKED_LAST = payload; } catch {}
            eventBus.emit('PUSH_CLICKED', { payload });
          } catch {}
        }, 500);
      }
    } catch (e) {
      // Module not available (e.g., Expo Go). Skip setting the handler.
    }
  })();
}

// Dev helper: emit a synthetic push-click from console
try {
  const root =
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof global !== 'undefined' && global) ||
    {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  root.__emitTestPush = (payload) => {
    try {
      // eslint-disable-next-line no-console
      console.log('[PUSH][root][manual]', payload);
      eventBus.emit('PUSH_CLICKED', { payload: payload || {} });
    } catch {}
  };
} catch {}


