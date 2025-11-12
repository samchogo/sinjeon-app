import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

export default function NotFoundRedirect() {
  const router = useRouter();
  React.useEffect(() => {
    // Swallow unmatched routes (e.g., sulbingapp://web...) and return to tabs
    router.replace('/(tabs)');
  }, [router]);
  return <View />;
}


