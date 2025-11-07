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

  const injectedWindowOpenJs = useMemo(() => `(() => {\n  try {\n    const sendOpen = (u,n,s) => {\n      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_WINDOW', url: u, name: n || '', specs: s || '' })); } catch(e){}\n    };\n    const sendOpenBlank = (u) => {\n      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_TARGET_BLANK', url: u })); } catch(e){}\n    };\n    const origOpen = window.open;\n    window.open = function(url, name, specs) {\n      if (url) sendOpen(url, name, specs);\n      return null;\n    };\n    document.addEventListener('click', function(e){\n      const a = e.target && e.target.closest ? e.target.closest('a[target=\"_blank\"]') : null;\n      if (a && a.href) {\n        if (/^https?:\\/\\//i.test(a.href)) { e.preventDefault(); sendOpenBlank(a.href); }\n      }\n    }, true);\n  } catch(e){}\n})(); true;`, []);

  const injectedScanJs = useMemo(() => `(() => {\n  try {\n    if (!window.__RN_SCAN_CALLBACKS) { window.__RN_SCAN_CALLBACKS = {}; }\n    window.requestBarcodeScan = function(success, error){\n      const id = String(Date.now());\n      window.__RN_SCAN_CALLBACKS[id] = { success, error };\n      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCAN_BARCODE', id }));\n    };\n    window.__onNativeScan = function(payload){\n      try {\n        const { id, code, error } = payload || {};\n        const cb = window.__RN_SCAN_CALLBACKS[id];\n        if (!cb) return;\n        if (code && cb.success) cb.success({ code }); else if (error && cb.error) cb.error(error);\n        delete window.__RN_SCAN_CALLBACKS[id];\n      } catch(e){}\n    };\n  } catch(e){}\n})(); true;`, []);

  const injectedCombinedJs = useMemo(() => `${injectedGeolocationJs}\n${injectedWindowOpenJs}\n${injectedScanJs}`, [injectedGeolocationJs, injectedWindowOpenJs, injectedScanJs]);
  const injectedContactsJs = useMemo(() => `(() => {\n  try {\n    if (!window.__RN_CONTACT_CALLBACKS) window.__RN_CONTACT_CALLBACKS = {};\n    window.requestContactPick = function(success, error){\n      const id = String(Date.now());\n      window.__RN_CONTACT_CALLBACKS[id] = { success, error };\n      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'REQUEST_CONTACT', id }));\n    };\n    window.__onNativeContact = function(payload){\n      try {\n        const { id, name, number, error } = payload || {};\n        const cb = window.__RN_CONTACT_CALLBACKS[id];\n        if (!cb) return;\n        if (name && number && cb.success) cb.success({ name, number });\n        else if (error && cb.error) cb.error(error);\n        delete window.__RN_CONTACT_CALLBACKS[id];\n      } catch(e){}\n    };\n  } catch(e){}\n})(); true;`, []);
  const injectedAllJs = useMemo(() => `${injectedCombinedJs}\n${injectedContactsJs}`, [injectedCombinedJs, injectedContactsJs]);
  const injectedFcmJs = useMemo(() => `(() => {\n  try {\n    if (!window.__RN_FCM_CALLBACKS) window.__RN_FCM_CALLBACKS = {};\n    window.requestFcmToken = function(success, error){\n      const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2);\n      const entry = { success: null, error: null, resolve: null, reject: null, t: null };\n      if (typeof success === 'function' || typeof error === 'function') {\n        entry.success = typeof success === 'function' ? success : null;\n        entry.error = typeof error === 'function' ? error : null;\n        window.__RN_FCM_CALLBACKS[id] = entry;\n        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_FCM_TOKEN', id }));\n        return;\n      }\n      return new Promise((resolve, reject) => {\n        entry.resolve = resolve; entry.reject = reject;\n        entry.t = setTimeout(() => {\n          delete window.__RN_FCM_CALLBACKS[id];\n          reject(new Error('FCM timeout'));\n        }, 15000);\n        window.__RN_FCM_CALLBACKS[id] = entry;\n        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_FCM_TOKEN', id }));\n      });\n    };\n    window.__onNativeFcmToken = function(payload){\n      try {\n        const { id, token, error } = payload || {};\n        const cb = window.__RN_FCM_CALLBACKS[id];\n        if (!cb) return;\n        if (cb.t) { try { clearTimeout(cb.t); } catch(_){} }\n        if (token) {\n          if (cb.resolve) cb.resolve(token);\n          if (cb.success) cb.success({ token });\n        } else if (error) {\n          if (cb.reject) cb.reject(error);\n          if (cb.error) cb.error(error);\n        }\n        delete window.__RN_FCM_CALLBACKS[id];\n      } catch(e){}\n    };\n  } catch(e){}\n})(); true;`, []);
  const injectedKakaoShareJs = useMemo(() => `(() => {\n  try {\n    window.requestShareKakao = function(url){\n      try {\n        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_SHARE_KAKAO', url: String(url||'') }));\n      } catch(e){}\n    };\n  } catch(e){}\n})(); true;`, []);
  const injectedAppVersionJs = useMemo(() => `(() => {\n  try {\n    if (!window.__RN_APPVER_CALLBACKS) window.__RN_APPVER_CALLBACKS = {};\n    // Returns a string version or null\n    window.requestAppVersion = function(success, error){\n      const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2);\n      const entry = { success: null, error: null, resolve: null, reject: null, t: null };\n      if (typeof success === 'function' || typeof error === 'function') {\n        entry.success = typeof success === 'function' ? success : null;\n        entry.error = typeof error === 'function' ? error : null;\n        window.__RN_APPVER_CALLBACKS[id] = entry;\n        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_APP_VERSION', id }));\n        return;\n      }\n      return new Promise((resolve, reject) => {\n        entry.resolve = resolve; entry.reject = reject;\n        entry.t = setTimeout(() => { delete window.__RN_APPVER_CALLBACKS[id]; reject(new Error('APP_VERSION timeout')); }, 10000);\n        window.__RN_APPVER_CALLBACKS[id] = entry;\n        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_APP_VERSION', id }));\n      });\n    };\n    window.__onNativeAppVersion = function(payload){\n      try {\n        const { id, version, error } = payload || {};\n        const cb = window.__RN_APPVER_CALLBACKS[id];\n        if (!cb) return;\n        if (cb.t) { try { clearTimeout(cb.t); } catch(_){} }\n        if (!error) {\n          if (cb.resolve) cb.resolve(version ?? null);\n          if (cb.success) cb.success(version ?? null);\n        } else {\n          if (cb.reject) cb.reject(error);\n          if (cb.error) cb.error(error);\n        }\n        delete window.__RN_APPVER_CALLBACKS[id];\n      } catch(e){}\n    };\n  } catch(e){}\n})(); true;`, []);
  const injectedAllWithFcmJs = useMemo(() => `${injectedAllJs}\n${injectedFcmJs}\n${injectedKakaoShareJs}\n${injectedAppVersionJs}`, [injectedAllJs, injectedFcmJs, injectedKakaoShareJs, injectedAppVersionJs]);
  const injectedCoopBridgeJs = useMemo(
    () =>
      `(() => {
  try {
    if (!window.AppInterfaceForCoop) window.AppInterfaceForCoop = {};
    var bridge = window.AppInterfaceForCoop;
    if (typeof bridge.onmessage !== 'function') {
      bridge.onmessage = function(){};
    }
    bridge.postMessage = function(message){
      try {
        var msg = (message == null) ? '' : String(message);
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COOP_BRIDGE', payload: msg }));
      } catch(e){}
    };
  } catch(e){}
})(); true;`,
    []
  );
  const injectedAllWithFcmAndCoopJs = useMemo(
    () => `${injectedAllWithFcmJs}\n${injectedCoopBridgeJs}`,
    [injectedAllWithFcmJs, injectedCoopBridgeJs]
  );

  // Listen for push click events and forward to web
  React.useEffect(() => {
    let off: any;
    (async () => {
      try {
        const { eventBus } = await import('@/lib/event-bus');
        off = eventBus.on('PUSH_CLICKED', ({ payload }) => {
          const js = `(function(){ try{ if (typeof window.pushTypeHandler==='function'){ window.pushTypeHandler(${JSON.stringify(
            payload
          )}); } }catch(e){} })(); true;`;
          webviewRef.current?.injectJavaScript(js);
        });
      } catch {}
    })();
    return () => { try { off && off(); } catch {} };
  }, []);

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
          // Fallback: 내부 화면으로 열되 __no_header=1 있으면 헤더 숨김
          const targetUrl = event?.nativeEvent?.targetUrl;
          if (!targetUrl) return;
          if (targetUrl.startsWith('intent://')) { Linking.openURL(targetUrl).catch(() => {}); return; }
          const schemes = ['ispmobile://','kakaotalk://','payco://','samsungpay://','kftc-bankpay://','passapp://'];
          if (schemes.some((s) => targetUrl.startsWith(s))) { Linking.openURL(targetUrl).catch(() => {}); return; }
          const hide = /[?&]__no_header=1\b/.test(targetUrl);
          router.push({ pathname: '/webview-view', params: { url: targetUrl, ...(hide ? { noHeader: '1' } : {}) } });
        }}
        geolocationEnabled
        injectedJavaScriptBeforeContentLoaded={injectedAllWithFcmAndCoopJs}
        onMessage={async (event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data || '{}');
            if (data.type === 'OPEN_TARGET_BLANK' && data.url) {
              const u = String(data.url);
              if (u.startsWith('http://') || u.startsWith('https://')) {
                Linking.openURL(u).catch(() => {});
                return;
              }
            } else if (data.type === 'OPEN_WINDOW' && data.url) {
              const u = String(data.url);
              const name = String(data.name || '');
              const specs = String(data.specs || '');
              const hideByName = name === 'noheader';
              const hideBySpecs = /(^|,|;)\s*noheader\b/i.test(specs);
              const hideByQuery = /[?&]__no_header=1\b/.test(u);
              const hide = hideByName || hideBySpecs || hideByQuery;
              router.push({ pathname: '/webview-view', params: { url: u, ...(hide ? { noHeader: '1' } : {}) } });
              return;
            } else if (data.type === 'REQUEST_FCM_TOKEN') {
              const id = String(data.id);
              try {
                const messaging = (await import('@react-native-firebase/messaging')).default;

                if (Platform.OS === 'ios') {
                  // iOS: do not request permission here; just try to fetch token without prompting
                  await messaging().setAutoInitEnabled(true);
                  const token = await messaging().getToken();
                  webviewRef.current?.injectJavaScript(`window.__onNativeFcmToken(${JSON.stringify({ id, token })}); true;`);
                  return;
                }

                // Android: try getToken first without prompting, then request notification permission only if needed (API 33+)
                await messaging().setAutoInitEnabled(true);
                let token = await messaging().getToken();
                if (!token && Platform.OS === 'android' && Platform.Version >= 33) {
                  const has = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
                  if (!has) {
                    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
                  }
                  try { await messaging().deleteToken(); } catch {}
                  await new Promise((r) => setTimeout(r, 300));
                  token = await messaging().getToken();
                }
                webviewRef.current?.injectJavaScript(`window.__onNativeFcmToken(${JSON.stringify({ id, token })}); true;`);
              } catch (e: any) {
                webviewRef.current?.injectJavaScript(`window.__onNativeFcmToken(${JSON.stringify({ id, error: { message: (e?.message) || 'FCM token failed' } })}); true;`);
              }
              return;
            } else if (data.type === 'REQUEST_SHARE_KAKAO') {
              const shareUrl = String(data.url || '');
              try {
                const tryUrl = `kakaotalk://send?text=${encodeURIComponent(shareUrl)}`;
                Linking.openURL(tryUrl).catch(() => {
                  // fallback: system share sheet
                  import('react-native').then(({ Share }) => {
                    Share.share({ message: shareUrl });
                  });
                });
              } catch {
                import('react-native').then(({ Share }) => {
                  Share.share({ message: shareUrl });
                });
              }
              return;
            } else if (data.type === 'REQUEST_APP_VERSION') {
              const id = String(data.id);
              try {
                let version: string | null = null;
                try {
                  const v = (Constants as any)?.expoConfig?.version;
                  version = (typeof v === 'string' && v.length > 0) ? v : null;
                } catch {}
                const payload = { id, version };
                webviewRef.current?.injectJavaScript(`window.__onNativeAppVersion(${JSON.stringify(payload)}); true;`);
              } catch (e: any) {
                webviewRef.current?.injectJavaScript(`window.__onNativeAppVersion(${JSON.stringify({ id, error: { message: e?.message || 'APP_VERSION failed' } })}); true;`);
              }
              return;
            } else if (data.type === 'COOP_BRIDGE') {
              let req: any = {};
              try { req = JSON.parse(String(data.payload || '{}')); } catch {}
              const messageId = String(req?.messageId ?? '');
              const reqType = String(req?.type ?? '');
              const reqData = req?.data ?? {};
              const sendCoopResponse = (respObj: any) => {
                const jsonStr = JSON.stringify(respObj);
                const js = `(function(){ try{ if (window.AppInterfaceForCoop && typeof window.AppInterfaceForCoop.onmessage==='function'){ window.AppInterfaceForCoop.onmessage({ data: ${JSON.stringify(
                  jsonStr
                )} }); } } catch(e){} })(); true;`;
                webviewRef.current?.injectJavaScript(js);
              };
              if (reqType === 'REQ_DATA_CONTACT_INFO') {
                const Contacts = await import('expo-contacts');
                const perm = await Contacts.requestPermissionsAsync();
                if (perm.status !== 'granted') {
                  sendCoopResponse({
                    header: {
                      type: 'REQ_DATA_CONTACT_INFO',
                      messageId,
                      data: reqData,
                      resultCode: 'PERMISSION_DENIED',
                      resultComment: '연락처 접근 권한이 거부되었습니다.',
                    },
                    body: { result: {} },
                  });
                  return;
                }
                const internalId = `coop-${messageId || Date.now()}`;
                router.push({ pathname: '/contact-pick', params: { id: internalId } });
                const { eventBus } = await import('@/lib/event-bus');
                const off = eventBus.on('CONTACT_PICKED', (p) => {
                  if (p.id !== internalId) return;
                  off();
                  sendCoopResponse({
                    header: {
                      type: 'REQ_DATA_CONTACT_INFO',
                      messageId,
                      data: reqData,
                      resultCode: 'SUCCESS',
                      resultComment: '연락처 정보 데이터 요청, 성공',
                    },
                    body: {
                      result: {
                        contactInfo: { name: p.name, phone: p.number },
                      },
                    },
                  });
                });
                return;
              } else {
                sendCoopResponse({
                  header: {
                    type: reqType || 'unknown message type',
                    messageId,
                    data: reqData || {},
                    resultCode: 'UNKNOWN_MESSAGE_TYPE',
                    resultComment: '알 수 없는 메시지 타입 입니다.',
                  },
                  body: { result: {} },
                });
                return;
              }
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


