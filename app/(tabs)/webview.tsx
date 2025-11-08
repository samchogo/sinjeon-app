import { getApps } from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { BackHandler, PermissionsAndroid, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// Serialize iOS FCM token requests to avoid race with remote message registration
let __IOS_FCM_REQUEST_IN_FLIGHT = false;

export default function WebviewScreen() {
  const webviewUrl = (Constants?.expoConfig?.extra as any)?.WEBVIEW_URL ?? process.env.EXPO_PUBLIC_WEBVIEW_URL ?? '';
  const webviewRef = React.useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = React.useState(false);
  const router = useRouter();
  const isReadyRef = React.useRef(false);
  const pendingPushRef = React.useRef<any[]>([]);
  const injectedGeolocationJs = useMemo(() => `(() => {\n  try {\n    if (!window.__RN_LOCATION_CALLBACKS) { window.__RN_LOCATION_CALLBACKS = {}; }\n    navigator.geolocation.getCurrentPosition = function(success, error) {\n      const id = String(Date.now());\n      window.__RN_LOCATION_CALLBACKS[id] = { success, error };\n      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_LOCATION', id }));\n    };\n    window.__onNativeLocation = function(payload) {\n      try {\n        const { id, coords, error } = payload || {};\n        const cb = window.__RN_LOCATION_CALLBACKS[id];\n        if (!cb) return;\n        if (coords && cb.success) cb.success({ coords });\n        else if (error && cb.error) cb.error(error);\n        delete window.__RN_LOCATION_CALLBACKS[id];\n      } catch (e) {}\n    };\n  } catch (e) {}\n})(); true;`, []);

  const injectedWindowOpenJs = useMemo(() => `(() => {\n  try {\n    const sendOpen = (u,n,s) => {\n      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_WINDOW', url: u, name: n || '', specs: s || '' })); } catch(e){}\n    };\n    const sendOpenBlank = (u) => {\n      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_TARGET_BLANK', url: u })); } catch(e){}\n    };\n    const origOpen = window.open;\n    window.open = function(url, name, specs) {\n      if (url) sendOpen(url, name, specs);\n      return null;\n    };\n    document.addEventListener('click', function(e){\n      const a = e.target && e.target.closest ? e.target.closest('a[target=\"_blank\"]') : null;\n      if (a && a.href) {\n        if (/^https?:\\/\\//i.test(a.href)) { e.preventDefault(); sendOpenBlank(a.href); }\n      }\n    }, true);\n  } catch(e){}\n})(); true;`, []);

  const injectedScanJs = useMemo(() => `(() => {\n  try {\n    if (!window.__RN_SCAN_CALLBACKS) { window.__RN_SCAN_CALLBACKS = {}; }\n    window.requestBarcodeScan = function(success, error){\n      const id = String(Date.now());\n      window.__RN_SCAN_CALLBACKS[id] = { success, error };\n      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCAN_BARCODE', id }));\n    };\n    window.__onNativeScan = function(payload){\n      try {\n        const { id, code, error } = payload || {};\n        const cb = window.__RN_SCAN_CALLBACKS[id];\n        if (!cb) return;\n        if (code && cb.success) cb.success({ code }); else if (error && cb.error) cb.error(error);\n        delete window.__RN_SCAN_CALLBACKS[id];\n      } catch(e){}\n    };\n  } catch(e){}\n})(); true;`, []);

  const injectedCombinedJs = useMemo(() => `${injectedGeolocationJs}\n${injectedWindowOpenJs}\n${injectedScanJs}`, [injectedGeolocationJs, injectedWindowOpenJs, injectedScanJs]);
  const injectedContactsJs = useMemo(() => `(() => {\n  try {\n    if (!window.__RN_CONTACT_CALLBACKS) window.__RN_CONTACT_CALLBACKS = {};\n    window.requestContactPick = function(success, error){\n      const id = String(Date.now());\n      window.__RN_CONTACT_CALLBACKS[id] = { success, error };\n      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'REQUEST_CONTACT', id }));\n    };\n    window.__onNativeContact = function(payload){\n      try {\n        const { id, name, number, error } = payload || {};\n        const cb = window.__RN_CONTACT_CALLBACKS[id];\n        if (!cb) return;\n        if (name && number && cb.success) cb.success({ name, number });\n        else if (error && cb.error) cb.error(error);\n        delete window.__RN_CONTACT_CALLBACKS[id];\n      } catch(e){}\n    };\n  } catch(e){}\n})(); true;`, []);
  const injectedAllJs = useMemo(() => `${injectedCombinedJs}\n${injectedContactsJs}`, [injectedCombinedJs, injectedContactsJs]);
  const injectedFcmJs = useMemo(() => `(() => {
  try {
    if (!window.__RN_FCM_CALLBACKS) window.__RN_FCM_CALLBACKS = {};
    if (!window.__FB_BLOCK_CTL) window.__FB_BLOCK_CTL = { on: false, t: null };
    window.requestFcmToken = function(success, error){
      const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2);
      const entry = { success: null, error: null, resolve: null, reject: null, t: null };
      // enable conditional block for firebase web scripts during token request
      try {
        window.__FB_BLOCK_CTL.on = true;
        if (window.__FB_BLOCK_CTL.t) { try { clearTimeout(window.__FB_BLOCK_CTL.t); } catch(_){} }
        window.__FB_BLOCK_CTL.t = setTimeout(function(){ try { window.__FB_BLOCK_CTL.on = false; } catch(_){} }, 15000);
      } catch(_){ }
      if (typeof success === 'function' || typeof error === 'function') {
        entry.success = typeof success === 'function' ? success : null;
        entry.error = typeof error === 'function' ? error : null;
        window.__RN_FCM_CALLBACKS[id] = entry;
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_FCM_TOKEN', id }));
        return;
      }
      return new Promise((resolve, reject) => {
        entry.resolve = resolve; entry.reject = reject;
        entry.t = setTimeout(() => {
          delete window.__RN_FCM_CALLBACKS[id];
          reject(new Error('FCM timeout'));
        }, 15000);
        window.__RN_FCM_CALLBACKS[id] = entry;
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_FCM_TOKEN', id }));
      });
    };
    window.__onNativeFcmToken = function(payload){
      try {
        const { id, token, osTypeCd, error } = payload || {};
        const cb = window.__RN_FCM_CALLBACKS[id];
        if (!cb) return;
        if (cb.t) { try { clearTimeout(cb.t); } catch(_){} }
        if (token) {
          var result = { token: token, osTypeCd: osTypeCd || ((/iPad|iPhone|iPod/i.test(navigator.userAgent)) ? 'IOS' : 'ANDROID') };
          if (cb.resolve) cb.resolve(result);
          if (cb.success) cb.success(result);
        } else if (error) {
          if (cb.reject) cb.reject(error);
          if (cb.error) cb.error(error);
        }
        delete window.__RN_FCM_CALLBACKS[id];
      } catch(e){} finally {
        try {
          if (window.__FB_BLOCK_CTL) {
            window.__FB_BLOCK_CTL.on = false;
            if (window.__FB_BLOCK_CTL.t) { try { clearTimeout(window.__FB_BLOCK_CTL.t); } catch(_){} }
          }
        } catch(_){ }
      }
    };
  } catch(e){}
})(); true;`, []);
  const injectedKakaoShareJs = useMemo(() => `(() => {
  try {
    window.requestShareKakao = function(url){
      try {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_SHARE_KAKAO', url: String(url||'') }));
      } catch(e){}
    };
  } catch(e){}
})(); true;`, []);
  const injectedAppVersionJs = useMemo(() => `(() => {
  try {
    if (!window.__RN_APPVER_CALLBACKS) window.__RN_APPVER_CALLBACKS = {};
    // Returns a string version or null
    window.requestAppVersion = function(success, error){
      const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2);
      const entry = { success: null, error: null, resolve: null, reject: null, t: null };
      if (typeof success === 'function' || typeof error === 'function') {
        entry.success = typeof success === 'function' ? success : null;
        entry.error = typeof error === 'function' ? error : null;
        window.__RN_APPVER_CALLBACKS[id] = entry;
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_APP_VERSION', id }));
        return;
      }
      return new Promise((resolve, reject) => {
        entry.resolve = resolve; entry.reject = reject;
        entry.t = setTimeout(() => { delete window.__RN_APPVER_CALLBACKS[id]; reject(new Error('APP_VERSION timeout')); }, 10000);
        window.__RN_APPVER_CALLBACKS[id] = entry;
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_APP_VERSION', id }));
      });
    };
    window.__onNativeAppVersion = function(payload){
      try {
        const { id, version, error } = payload || {};
        const cb = window.__RN_APPVER_CALLBACKS[id];
        if (!cb) return;
        if (cb.t) { try { clearTimeout(cb.t); } catch(_){} }
        if (!error) {
          if (cb.resolve) cb.resolve(version ?? null);
          if (cb.success) cb.success(version ?? null);
        } else {
          if (cb.reject) cb.reject(error);
          if (cb.error) cb.error(error);
        }
        delete window.__RN_APPVER_CALLBACKS[id];
      } catch(e){}
    };
  } catch(e){}
})(); true;`, []);
  const injectedOpenSettingsJs = useMemo(() => `(() => {
  try {
    if (!window.__RN_SETTINGS_CALLBACKS) window.__RN_SETTINGS_CALLBACKS = {};
    window.requestOpenAppSettings = function(success, error){
      const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2);
      const entry = { success: null, error: null, resolve: null, reject: null, t: null };
      if (typeof success === 'function' || typeof error === 'function') {
        entry.success = typeof success === 'function' ? success : null;
        entry.error = typeof error === 'function' ? error : null;
        window.__RN_SETTINGS_CALLBACKS[id] = entry;
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_OPEN_SETTINGS', id }));
        return;
      }
      return new Promise((resolve, reject) => {
        entry.resolve = resolve; entry.reject = reject;
        entry.t = setTimeout(() => { delete window.__RN_SETTINGS_CALLBACKS[id]; reject(new Error('OPEN_SETTINGS timeout')); }, 10000);
        window.__RN_SETTINGS_CALLBACKS[id] = entry;
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_OPEN_SETTINGS', id }));
      });
    };
    window.__onNativeOpenSettings = function(payload){
      try {
        const { id, ok, error } = payload || {};
        const cb = window.__RN_SETTINGS_CALLBACKS[id];
        if (!cb) return;
        if (cb.t) { try { clearTimeout(cb.t); } catch(_){} }
        if (ok) {
          if (cb.resolve) cb.resolve(true);
          if (cb.success) cb.success(true);
        } else if (error) {
          if (cb.reject) cb.reject(error);
          if (cb.error) cb.error(error);
        }
        delete window.__RN_SETTINGS_CALLBACKS[id];
      } catch(e){}
    };
  } catch(e){}
})(); true;`, []);
  const injectedCloseWindowJs = useMemo(() => `(() => {
  try {
    const __origClose = window.close;
    window.close = function(){
      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_CLOSE_WINDOW' })); } catch(e){}
      return undefined;
    };
    // expose also as explicit bridge
    window.requestWindowClose = function(){
      try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_CLOSE_WINDOW' })); } catch(e){}
      return true;
    };
  } catch(e){}
})(); true;`, []);
  // Provide a reliable way to ask native WebView to open a new window even after async work
  const injectedRequestWindowJs = useMemo(() => `(() => {
  try {
    window.requestWindowOpen = function(url, optsOrTitle, maybeNoHeader){
      try {
        if (!url) return false;
        var base = (typeof location !== 'undefined') ? location.href : undefined;
        var u; try { u = new URL(String(url), base); } catch(e){ return false; }
        var title = ''; var noheader = false;
        if (typeof optsOrTitle === 'string') { title = optsOrTitle || ''; noheader = !!maybeNoHeader; }
        else if (optsOrTitle && typeof optsOrTitle === 'object') { title = String(optsOrTitle.title || ''); noheader = !!optsOrTitle.noheader; }
        if (title) { try { u.searchParams.set('__title', encodeURIComponent(title)); } catch(_){ u.searchParams.set('__title', title); } }
        if (noheader) { u.searchParams.set('__no_header','1'); }
        var finalUrl = u.toString();
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_WINDOW', url: finalUrl }));
          return true;
        }
        // Fallback for pure browser
        try { window.location.assign(finalUrl); return true; } catch(_) { return false; }
      } catch(e){ return false; }
    };
  } catch(e) {}
})(); true;`, []);
  const injectedBlockFirebaseJs = useMemo(() => `(() => {
  try {
    var isFirebaseScript = function(u){
      try { var s = String(u || '');
        return /(?:^|\/)?firebase(?:-[a-z]+)?\.js(?:$|[?#])/i.test(s) || /gstatic\.com\/firebasejs/i.test(s);
      } catch(e){ return false; }
    };
    var origAppend = Node && Node.prototype && Node.prototype.appendChild;
    if (origAppend) { Node.prototype.appendChild = function(child){ try { var u=(child && (child.src||child.href))||''; if (isFirebaseScript(u)) { return child; } } catch(_){} return origAppend.apply(this, arguments); }; }
    var origInsertBefore = Node && Node.prototype && Node.prototype.insertBefore;
    if (origInsertBefore) { Node.prototype.insertBefore = function(child){ try { var u=(child && (child.src||child.href))||''; if (isFirebaseScript(u)) { return child; } } catch(_){} return origInsertBefore.apply(this, arguments); }; }
    var origSetAttr = Element && Element.prototype && Element.prototype.setAttribute;
    if (origSetAttr) { Element.prototype.setAttribute = function(name, value){ try { if ((name==='src'||name==='href') && isFirebaseScript(value)) { return; } } catch(_){} return origSetAttr.apply(this, arguments); }; }
    if (!('firebase' in window)) {
      Object.defineProperty(window, 'firebase', { configurable: true, get: function(){ return window.__firebaseShim || (window.__firebaseShim = { apps: [], initializeApp: function(){ return {}; }, app: function(){ return {}; } }); }, set: function(_){} });
    }
  } catch(e) {}
})(); true;`, []);
  const injectedFirebaseModShimJs = useMemo(() => `(() => {
  try {
    // Provide minimal compat and modular shims so bundled web code won't throw
    if (!('firebase' in window)) {
      Object.defineProperty(window, 'firebase', { configurable: true, get: function(){ return window.__firebaseShim || (window.__firebaseShim = { apps: [], initializeApp: function(){ return {}; }, app: function(){ return {}; } }); }, set: function(_){} });
    }
    if (typeof window.initializeApp !== 'function') {
      window.initializeApp = function(){ return { name: '[DEFAULT]' }; };
    }
    if (typeof window.getApp !== 'function') {
      window.getApp = function(){ return { name: '[DEFAULT]' }; };
    }
    if (typeof window.getMessaging !== 'function') {
      window.getMessaging = function(){ return {}; };
    }
    if (typeof window.getToken !== 'function') {
      window.getToken = async function(){ return ''; };
    }
  } catch(e){}
})(); true;`, []);
  const injectedAllWithFcmJs = useMemo(() => `${injectedFirebaseModShimJs}
${injectedFcmJs}
${injectedAllJs}
${injectedKakaoShareJs}
${injectedAppVersionJs}
${injectedOpenSettingsJs}
${injectedRequestWindowJs}
${injectedCloseWindowJs}
${injectedBlockFirebaseJs}`, [injectedAllJs, injectedFcmJs, injectedKakaoShareJs, injectedAppVersionJs, injectedOpenSettingsJs, injectedRequestWindowJs, injectedCloseWindowJs, injectedBlockFirebaseJs]);
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
    // alias for compatibility with different casing used by some pages
    try { if (typeof window.AppInterFaceForCoop === 'undefined') { window.AppInterFaceForCoop = window.AppInterfaceForCoop; } } catch(_){ }
  } catch(e){}
})(); true;`,
    []
  );
  const injectedAllWithFcmAndCoopJs = useMemo(
    () => `${injectedCoopBridgeJs}\n${injectedAllWithFcmJs}`,
    [injectedAllWithFcmJs, injectedCoopBridgeJs]
  );

  // Listen for push click events and forward to web (buffer until ready)
  React.useEffect(() => {
    let off: any;
    (async () => {
      try {
        const { eventBus } = await import('@/lib/event-bus');
        off = eventBus.on('PUSH_CLICKED', ({ payload }) => {
          if (!(isReadyRef as any).current) {
            (pendingPushRef as any).current.push(payload);
            // eslint-disable-next-line no-console
            console.log('[PUSH][tabs][buffer]', payload);
            return;
          }
          // eslint-disable-next-line no-console
          console.log('[PUSH][tabs][inject]', payload);
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
        injectedJavaScriptForMainFrameOnly={false}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
        onLoad={() => {
          try {
            (isReadyRef as any).current = true;
            webviewRef.current?.injectJavaScript(injectedFirebaseModShimJs);
            webviewRef.current?.injectJavaScript(injectedFcmJs);
            webviewRef.current?.injectJavaScript(injectedAppVersionJs);
            webviewRef.current?.injectJavaScript(injectedCoopBridgeJs);
            webviewRef.current?.injectJavaScript(injectedKakaoShareJs);
            webviewRef.current?.injectJavaScript(injectedOpenSettingsJs);
            webviewRef.current?.injectJavaScript(injectedRequestWindowJs);
            webviewRef.current?.injectJavaScript(injectedCloseWindowJs);
            // also check root buffer (in case event fired before listener attached)
            try {
              const gp = (global as any).__PUSH_CLICKED_LAST;
              if (gp) {
                // eslint-disable-next-line no-console
                console.log('[PUSH][tabs][inject-root]', gp);
                const js = `(function(){ try{ if (typeof window.pushTypeHandler==='function'){ window.pushTypeHandler(${JSON.stringify(
                  gp
                )}); } }catch(e){} })(); true;`;
                webviewRef.current?.injectJavaScript(js);
                (global as any).__PUSH_CLICKED_LAST = null;
              }
            } catch {}
            // drain buffered push payloads
            try {
              const list = (pendingPushRef as any).current || [];
              (pendingPushRef as any).current = [];
              for (const pl of list) {
                // eslint-disable-next-line no-console
                console.log('[PUSH][tabs][inject-drain]', pl);
                const js = `(function(){ try{ if (typeof window.pushTypeHandler==='function'){ window.pushTypeHandler(${JSON.stringify(
                  pl
                )}); } }catch(e){} })(); true;`;
                webviewRef.current?.injectJavaScript(js);
              }
            } catch {}
          } catch {}
        }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={true}
        onShouldStartLoadWithRequest={(req) => {
          // Intercept window.open/new-window navigations
          if (req && req.url && req.isTopFrame === false) {
            router.push({ pathname: '/webview-view', params: { url: req.url } });
            return false;
          }
          const u = req?.url || '';
          if (u.startsWith('sulbingapp://close_webview')) { try { router.back(); } catch {} return false; }
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
                // Diagnostics: config and RNFirebase default app status
                try {
                  const appNames = getApps?.().map((a: any) => a?.name) ?? [];
                  // eslint-disable-next-line no-console
                  console.log('[RNFB][tabs] apps:', appNames);
                  try {
                    const opts = messaging().app.options;
                    console.log('[RNFB][tabs] default options:', {
                      appId: opts?.appId, projectId: opts?.projectId, hasApiKey: !!opts?.apiKey,
                    });
                  } catch (e: any) {
                    console.log('[RNFB][tabs] app() error:', e?.message);
                  }
                } catch (e: any) {
                  // eslint-disable-next-line no-console
                  console.log('[RNFB][tabs] import app failed:', e?.message);
                }
                try {
                  // eslint-disable-next-line no-console
                  console.log('[CFG][tabs]', {
                    variant: (Constants as any)?.expoConfig?.extra?.APP_VARIANT,
                    bundleId: (Constants as any)?.expoConfig?.ios?.bundleIdentifier,
                    googleServicesFile: (Constants as any)?.expoConfig?.ios?.googleServicesFile,
                    platform: Platform.OS,
                  });
                } catch {}
                if (Platform.OS === 'ios') {
                  // simple lock to avoid concurrent requests
                  if (__IOS_FCM_REQUEST_IN_FLIGHT) {
                    for (let i = 0; i < 20 && __IOS_FCM_REQUEST_IN_FLIGHT; i++) {
                      await new Promise((r) => setTimeout(r, 150));
                    }
                  }
                  __IOS_FCM_REQUEST_IN_FLIGHT = true;
                  // iOS: Ensure APNs registration, then try to get token without prompting.
                  // eslint-disable-next-line no-console
                  console.log('[FCM][tabs][iOS] begin');
                  try {
                    await messaging().setAutoInitEnabled(true);
                    try {
                      // Ensure device is registered before any getToken call
                      let registered = false;
                      try {
                        // @ts-ignore
                        registered = !!(await messaging().isDeviceRegisteredForRemoteMessages?.());
                      } catch {
                        // @ts-ignore
                        registered = !!(messaging() as any).isDeviceRegisteredForRemoteMessages;
                      }
                      console.log('[FCM][tabs][iOS] isRegistered:', !!registered);
                      if (!registered) {
                        await messaging().registerDeviceForRemoteMessages(); /* eslint-disable-line */
                        await new Promise((r) => setTimeout(r, 200));
                        try {
                          // @ts-ignore
                          registered = !!(await messaging().isDeviceRegisteredForRemoteMessages?.());
                        } catch {
                          // @ts-ignore
                          registered = !!(messaging() as any).isDeviceRegisteredForRemoteMessages;
                        }
                        console.log('[FCM][tabs][iOS] registered now:', registered);
                      }
                    } catch (e) { console.log('[FCM][tabs][iOS] register err', (e as any)?.message); }
                    const apns = await messaging().getAPNSToken(); console.log('[FCM][tabs][iOS] apns:', apns);
                    let token: string | undefined;
                    try {
                      await new Promise((r) => setTimeout(r, 150));
                      token = await messaging().getToken();
                      console.log('[FCM][tabs][iOS] token1:', token);
                    } catch (e) {
                      console.log('[FCM][tabs][iOS] getToken err1', (e as any)?.message);
                    }
                    // If still missing, as a fallback, request permission and retry once.
                    if (!token) {
                      try {
                        await messaging().registerDeviceForRemoteMessages(); /* eslint-disable-line */
                        await new Promise((r) => setTimeout(r, 200));
                      } catch (e) { console.log('[FCM][tabs][iOS] re-register err', (e as any)?.message); }
                      try { token = await messaging().getToken(); console.log('[FCM][tabs][iOS] token2:', token); } catch (e) { console.log('[FCM][tabs][iOS] getToken err2', (e as any)?.message); }
                    }
                    webviewRef.current?.injectJavaScript(`window.__onNativeFcmToken(${JSON.stringify({ id, token, osTypeCd: 'IOS', apnsToken: apns || null })}); true;`);
                    return;
                  } finally {
                    __IOS_FCM_REQUEST_IN_FLIGHT = false;
                  }
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
                webviewRef.current?.injectJavaScript(`window.__onNativeFcmToken(${JSON.stringify({ id, token, osTypeCd: 'ANDROID' })}); true;`);
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
                  Share.share({ message: shareUrl });
                });
              } catch {
                Share.share({ message: shareUrl });
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
            } else if (data.type === 'REQUEST_CLOSE_WINDOW') {
              try { router.back(); } catch {}
              return;
            } else if (data.type === 'REQUEST_OPEN_SETTINGS') {
              const id = String(data.id);
              try {
                await Linking.openSettings();
                webviewRef.current?.injectJavaScript(`window.__onNativeOpenSettings(${JSON.stringify({ id, ok: true })}); true;`);
              } catch (e: any) {
                webviewRef.current?.injectJavaScript(`window.__onNativeOpenSettings(${JSON.stringify({ id, ok: false, error: { message: e?.message || 'OPEN_SETTINGS failed' } })}); true;`);
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
                // eslint-disable-next-line no-console
                console.log('[COOP][tabs][send]', respObj);
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


