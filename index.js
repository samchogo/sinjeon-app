import 'expo-router/entry';
import { Platform } from 'react-native';
import { eventBus } from './lib/event-bus';

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
          eventBus.emit('PUSH_CLICKED', { payload });
        } catch {}
      });

      // When app opened from quit by tapping a notification
      const initial = await messaging().getInitialNotification();
      if (initial) {
        setTimeout(() => {
          try {
            const payload = initial?.data ?? initial ?? {};
            eventBus.emit('PUSH_CLICKED', { payload });
          } catch {}
        }, 500);
      }
    } catch (e) {
      // Module not available (e.g., Expo Go). Skip setting the handler.
    }
  })();
}


