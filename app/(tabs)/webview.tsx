import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { BackHandler, PermissionsAndroid, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

export default function WebviewScreen() {
  const webviewUrl = (Constants?.expoConfig?.extra as any)?.WEBVIEW_URL ?? process.env.EXPO_PUBLIC_WEBVIEW_URL ?? '';
  const webviewRef = React.useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = React.useState(false);
  const router = useRouter();
  const injectedGeolocationJs = useMemo(() => `(() => {\n  try {\n    if (!window.__RN_LOCATION_CALLBACKS) { window.__RN_LOCATION_CALLBACKS = {}; }\n    navigator.geolocation.getCurrentPosition = function(success, error) {\n      const id = String(Date.now());\n      window.__RN_LOCATION_CALLBACKS[id] = { success, error };\n      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_LOCATION', id }));\n    };\n    window.__onNativeLocation = function(payload) {\n      try {\n        const { id, coords, error } = payload || {};\n        const cb = window.__RN_LOCATION_CALLBACKS[id];\n        if (!cb) return;\n        if (coords && cb.success) cb.success({ coords });\n        else if (error && cb.error) cb.error(error);\n        delete window.__RN_LOCATION_CALLBACKS[id];\n      } catch (e) {}\n    };\n  } catch (e) {}\n})(); true;`, []);

  const injectedWindowOpenJs = useMemo(() => `(() => {\n  try {\n    const sendOpen = (u) => {\n      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_WINDOW', url: u })); } catch(e){}\n    };\n    const origOpen = window.open;\n    window.open = function(url, name, specs) {\n      if (url) sendOpen(url);\n      return null;\n    };\n    document.addEventListener('click', function(e){\n      const a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;\n      if (a && a.href) { e.preventDefault(); sendOpen(a.href); }\n    }, true);\n  } catch(e){}\n})(); true;`, []);

  const injectedScanJs = useMemo(() => `(() => {\n  try {\n    if (!window.__RN_SCAN_CALLBACKS) { window.__RN_SCAN_CALLBACKS = {}; }\n    window.requestBarcodeScan = function(success, error){\n      const id = String(Date.now());\n      window.__RN_SCAN_CALLBACKS[id] = { success, error };\n      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCAN_BARCODE', id }));\n    };\n    window.__onNativeScan = function(payload){\n      try {\n        const { id, code, error } = payload || {};\n        const cb = window.__RN_SCAN_CALLBACKS[id];\n        if (!cb) return;\n        if (code && cb.success) cb.success({ code }); else if (error && cb.error) cb.error(error);\n        delete window.__RN_SCAN_CALLBACKS[id];\n      } catch(e){}\n    };\n  } catch(e){}\n})(); true;`, []);

  const injectedCombinedJs = useMemo(() => `${injectedGeolocationJs}\n${injectedWindowOpenJs}\n${injectedScanJs}`, [injectedGeolocationJs, injectedWindowOpenJs, injectedScanJs]);
  const injectedContactsJs = useMemo(() => `(() => {\n  try {\n    if (!window.__RN_CONTACT_CALLBACKS) window.__RN_CONTACT_CALLBACKS = {};\n    window.requestContactPick = function(success, error){\n      const id = String(Date.now());\n      window.__RN_CONTACT_CALLBACKS[id] = { success, error };\n      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'REQUEST_CONTACT', id }));\n    };\n    window.__onNativeContact = function(payload){\n      try {\n        const { id, name, number, error } = payload || {};\n        const cb = window.__RN_CONTACT_CALLBACKS[id];\n        if (!cb) return;\n        if (name && number && cb.success) cb.success({ name, number });\n        else if (error && cb.error) cb.error(error);\n        delete window.__RN_CONTACT_CALLBACKS[id];\n      } catch(e){}\n    };\n  } catch(e){}\n})(); true;`, []);
  const injectedAllJs = useMemo(() => `${injectedCombinedJs}\n${injectedContactsJs}`, [injectedCombinedJs, injectedContactsJs]);
  const injectedFcmJs = useMemo(() => `(() => {\n  try {\n    if (!window.__RN_FCM_CALLBACKS) window.__RN_FCM_CALLBACKS = {};\n    window.requestFcmToken = function(success, error){\n      const id = String(Date.now());\n      window.__RN_FCM_CALLBACKS[id] = { success, error };\n      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'REQUEST_FCM_TOKEN', id }));\n    };\n    window.__onNativeFcmToken = function(payload){\n      try {\n        const { id, token, error } = payload || {};\n        const cb = window.__RN_FCM_CALLBACKS[id];\n        if (!cb) return;\n        if (token && cb.success) cb.success({ token }); else if (error && cb.error) cb.error(error);\n        delete window.__RN_FCM_CALLBACKS[id];\n      } catch(e){}\n    };\n  } catch(e){}\n})(); true;`, []);
  const injectedAllWithFcmJs = useMemo(() => `${injectedAllJs}\n${injectedFcmJs}`, [injectedAllJs, injectedFcmJs]);

  if (!webviewUrl) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.message}>
          EXPO_PUBLIC_WEBVIEW_URL 환경변수가 설정되지 않았습니다. .env 파일에 값을 추가하세요.
        </Text>
      </View>
    );
  }

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (canGoBack) {
          webviewRef.current?.goBack();
        } else {
          BackHandler.exitApp();
        }
        return true; // consume event
      };

      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [canGoBack])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <WebView
        ref={webviewRef}
        source={{ uri: webviewUrl }}
        style={styles.webview}
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(req) => {
          // Intercept window.open/new-window navigations
          if (req && req.url && req.isTopFrame === false) {
            router.push({ pathname: '/webview-view', params: { url: req.url } });
            return false;
          }
          const u = req?.url || '';
          if (u.startsWith('intent://')) { Linking.openURL(u).catch(() => {}); return false; }
          const schemes = ['ispmobile://','kakaotalk://','payco://','samsungpay://','kftc-bankpay://','passapp://'];
          if (schemes.some((s) => u.startsWith(s))) { Linking.openURL(u).catch(() => {}); return false; }
          return true;
        }}
        onOpenWindow={(event: any) => {
          // Fallback for platforms that support onOpenWindow
          const targetUrl = event?.nativeEvent?.targetUrl;
          if (targetUrl) {
            const t = targetUrl;
            if (t.startsWith('intent://')) { Linking.openURL(t).catch(() => {}); return; }
            const schemes = ['ispmobile://','kakaotalk://','payco://','samsungpay://','kftc-bankpay://','passapp://'];
            if (schemes.some((s) => t.startsWith(s))) { Linking.openURL(t).catch(() => {}); return; }
            router.push({ pathname: '/webview-view', params: { url: t } });
          }
        }}
        geolocationEnabled
        injectedJavaScriptBeforeContentLoaded={injectedAllWithFcmJs}
        onMessage={async (event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data || '{}');
            if (data.type === 'OPEN_WINDOW' && data.url) {
              router.push({ pathname: '/webview-view', params: { url: data.url } });
              return;
            } else if (data.type === 'REQUEST_FCM_TOKEN') {
              const id = String(data.id);
              try {
                if (Platform.OS === 'android' && Platform.Version >= 33) {
                  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
                }
                const messaging = (await import('@react-native-firebase/messaging')).default;
                await messaging().requestPermission();
                const token = await messaging().getToken();
                webviewRef.current?.injectJavaScript(`window.__onNativeFcmToken(${JSON.stringify({ id, token })}); true;`);
              } catch (e: any) {
                webviewRef.current?.injectJavaScript(`window.__onNativeFcmToken(${JSON.stringify({ id, error: { message: (e?.message) || 'FCM token failed' } })}); true;`);
              }
              return;
            } else if (data.type === 'SCAN_BARCODE') {
              const id = String(data.id);
              router.push({ pathname: '/barcode-scan', params: { id } });
              // Listen for result once and forward to web page
              const { eventBus } = await import('@/lib/event-bus');
              const off = eventBus.on('SCAN_RESULT', (payload) => {
                if (payload.id !== id) return;
                off();
                webviewRef.current?.injectJavaScript(`window.__onNativeScan(${JSON.stringify({ id, code: payload.code })}); true;`);
              });
              return;
            } else if (data.type === 'REQUEST_CONTACT') {
              const id = String(data.id);
              const Contacts = await import('expo-contacts');
              const perm = await Contacts.requestPermissionsAsync();
              if (perm.status !== 'granted') {
                webviewRef.current?.injectJavaScript(`window.__onNativeContact(${JSON.stringify({ id, error: { code: 1, message: 'Permission denied' } })}); true;`);
                return;
              }
              router.push({ pathname: '/contact-pick', params: { id } });
              const { eventBus } = await import('@/lib/event-bus');
              const off = eventBus.on('CONTACT_PICKED', (p) => {
                if (p.id !== id) return;
                off();
                webviewRef.current?.injectJavaScript(`window.__onNativeContact(${JSON.stringify({ id, name: p.name, number: p.number })}); true;`);
              });
              return;
            } else if (data.type === 'REQUEST_LOCATION') {
              const id = data.id;
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status !== 'granted') {
                webviewRef.current?.injectJavaScript(`window.__onNativeLocation(${JSON.stringify({ id, error: { code: 1, message: 'Permission denied' } })}); true;`);
                return;
              }
              const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              const coords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy ?? null,
              };
              webviewRef.current?.injectJavaScript(`window.__onNativeLocation(${JSON.stringify({ id, coords })}); true;`);
            }
          } catch (e) {
            // ignore parse errors
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  message: {
    textAlign: 'center',
    fontSize: 16,
  },
});


