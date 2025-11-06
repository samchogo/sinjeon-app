import 'expo-router/entry';
import { Platform } from 'react-native';

// Set background handler only when native Firebase module is available (dev build / production app)
if (Platform.OS !== 'web') {
  (async () => {
    try {
      const messaging = (await import('@react-native-firebase/messaging')).default;
      messaging().setBackgroundMessageHandler(async (remoteMessage) => {
        // customize if needed
      });
    } catch (e) {
      // Module not available (e.g., Expo Go). Skip setting the handler.
    }
  })();
}


