import messaging from '@react-native-firebase/messaging';
import 'expo-router/entry';

// Background/quit-state FCM handler
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  // no-op: customize if needed
});


