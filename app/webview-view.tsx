import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { BackHandler, PermissionsAndroid, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

export default function WebviewViewScreen() {
  const { url, noHeader } = useLocalSearchParams<{ url?: string; noHeader?: string }>();
  const router = useRouter();
  const webviewRef = React.useRef<WebView>(null);
  const [title, setTitle] = React.useState<string>('');
  const [canGoBack, setCanGoBack] = React.useState(false);
  const pendingBackRef = React.useRef(false);
  const backTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const injectedTitleObserver = `(() => {
    function sendTitle(){ try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type:'TITLE', title: document.title||'' })); } catch(e){} }
    try {
      const observer = new MutationObserver(sendTitle);
      const titleEl = document.querySelector('title');
      if (titleEl) observer.observe(titleEl, { childList: true });
      window.addEventListener('load', sendTitle);
      document.addEventListener('DOMContentLoaded', sendTitle);
      setTimeout(sendTitle, 0);
    } catch(e){}
  })(); true;`;
  const injectedGeolocationJs = `(() => { try { if (!window.__RN_LOCATION_CALLBACKS) { window.__RN_LOCATION_CALLBACKS = {}; } navigator.geolocation.getCurrentPosition = function(success, error){ const id = String(Date.now()); window.__RN_LOCATION_CALLBACKS[id] = { success, error }; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_LOCATION', id })); }; window.__onNativeLocation = function(payload){ try { const { id, coords, error } = payload || {}; const cb = window.__RN_LOCATION_CALLBACKS[id]; if (!cb) return; if (coords && cb.success) cb.success({ coords }); else if (error && cb.error) cb.error(error); delete window.__RN_LOCATION_CALLBACKS[id]; } catch(e){} }; } catch(e){} })(); true;`;
  const injectedWindowOpenJs = `(() => {
    try {
      const sendOpen = (u,n,s) => {
        try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_WINDOW', url: u, name: n || '', specs: s || '' })); } catch(e){}
      };
      const sendOpenBlank = (u) => {
        try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_TARGET_BLANK', url: u })); } catch(e){}
      };
      const origOpen = window.open;
      window.open = function(url, name, specs) {
        if (url) sendOpen(url, name, specs);
        return null;
      };
      document.addEventListener('click', function(e){
        const a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
        if (a && a.href) {
          if (/^https?:\/\//i.test(a.href)) { e.preventDefault(); sendOpenBlank(a.href); }
        }
      }, true);
    } catch(e){}
  })(); true;`;
  const injectedKakaoShareJs = `(() => { try { window.requestShareKakao = function(url){ try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_SHARE_KAKAO', url: String(url||'') })); } catch(e){} }; } catch(e){} })(); true;`;
  const injectedFcmJs = `(() => { try { if (!window.__RN_FCM_CALLBACKS) window.__RN_FCM_CALLBACKS = {}; if (!window.__FB_BLOCK_CTL) window.__FB_BLOCK_CTL = { on: false, t: null }; window.requestFcmToken = function(success, error){ const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2); const entry = { success: null, error: null, resolve: null, reject: null, t: null }; try { window.__FB_BLOCK_CTL.on = true; if (window.__FB_BLOCK_CTL.t) { try { clearTimeout(window.__FB_BLOCK_CTL.t); } catch(_){} } window.__FB_BLOCK_CTL.t = setTimeout(function(){ try { window.__FB_BLOCK_CTL.on = false; } catch(_){} }, 15000); } catch(_){} if (typeof success === 'function' || typeof error === 'function') { entry.success = typeof success === 'function' ? success : null; entry.error = typeof error === 'function' ? error : null; window.__RN_FCM_CALLBACKS[id] = entry; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_FCM_TOKEN', id })); return; } return new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; entry.t = setTimeout(() => { delete window.__RN_FCM_CALLBACKS[id]; reject(new Error('FCM timeout')); }, 15000); window.__RN_FCM_CALLBACKS[id] = entry; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_FCM_TOKEN', id })); }); }; window.__onNativeFcmToken = function(payload){ try { const { id, token, error } = payload || {}; const cb = window.__RN_FCM_CALLBACKS[id]; if (!cb) return; if (cb.t) { try { clearTimeout(cb.t); } catch(_){} } if (token) { if (cb.resolve) cb.resolve(token); if (cb.success) cb.success({ token }); } else if (error) { if (cb.reject) cb.reject(error); if (cb.error) cb.error(error); } delete window.__RN_FCM_CALLBACKS[id]; } catch(e){} finally { try { if (window.__FB_BLOCK_CTL) { window.__FB_BLOCK_CTL.on = false; if (window.__FB_BLOCK_CTL.t) { try { clearTimeout(window.__FB_BLOCK_CTL.t); } catch(_){} } } } catch(_){} } }; } catch(e){} })(); true;`;
  const injectedAppVersionJs = `(() => { try { if (!window.__RN_APPVER_CALLBACKS) window.__RN_APPVER_CALLBACKS = {}; window.requestAppVersion = function(success, error){ const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2); const entry = { success: null, error: null, resolve: null, reject: null, t: null }; if (typeof success === 'function' || typeof error === 'function') { entry.success = typeof success === 'function' ? success : null; entry.error = typeof error === 'function' ? error : null; window.__RN_APPVER_CALLBACKS[id] = entry; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_APP_VERSION', id })); return; } return new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; entry.t = setTimeout(() => { delete window.__RN_APPVER_CALLBACKS[id]; reject(new Error('APP_VERSION timeout')); }, 10000); window.__RN_APPVER_CALLBACKS[id] = entry; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_APP_VERSION', id })); }); }; window.__onNativeAppVersion = function(payload){ try { const { id, version, error } = payload || {}; const cb = window.__RN_APPVER_CALLBACKS[id]; if (!cb) return; if (cb.t) { try { clearTimeout(cb.t); } catch(_){} } if (!error) { if (cb.resolve) cb.resolve(version ?? null); if (cb.success) cb.success(version ?? null); } else { if (cb.reject) cb.reject(error); if (cb.error) cb.error(error); } delete window.__RN_APPVER_CALLBACKS[id]; } catch(e){} }; } catch(e){} })(); true;`;
  const injectedBlockFirebaseJs = `(() => { try { 
    var isFirebaseScript = function(u){ try { var s=String(u||''); return /(?:^|\/)?firebase(?:-[a-z]+)?\.js(?:$|[?#])/i.test(s) || /gstatic\.com\/firebasejs/i.test(s); } catch(e){ return false; } };
    var oa = Node && Node.prototype && Node.prototype.appendChild; if (oa) { Node.prototype.appendChild = function(c){ try { var u=(c && (c.src||c.href))||''; if (isFirebaseScript(u)) { return c; } } catch(_){} return oa.apply(this, arguments); }; }
    var oib = Node && Node.prototype && Node.prototype.insertBefore; if (oib) { Node.prototype.insertBefore = function(c){ try { var u=(c && (c.src||c.href))||''; if (isFirebaseScript(u)) { return c; } } catch(_){} return oib.apply(this, arguments); }; }
    var osa = Element && Element.prototype && Element.prototype.setAttribute; if (osa) { Element.prototype.setAttribute = function(n,v){ try { if ((n==='src'||n==='href') && isFirebaseScript(v)) { return; } } catch(_){} return osa.apply(this, arguments); };
    }
    if (!('firebase' in window)) { Object.defineProperty(window, 'firebase', { configurable: true, get: function(){ return window.__firebaseShim || (window.__firebaseShim = { apps: [], initializeApp: function(){ return {}; }, app: function(){ return {}; } }); }, set: function(_){} }); }
  } catch(e) {} })(); true;`;
  const injectedCoopBridgeJs = `(() => { try { if (!window.AppInterfaceForCoop) window.AppInterfaceForCoop = {}; var bridge = window.AppInterfaceForCoop; if (typeof bridge.onmessage !== 'function') { bridge.onmessage = function(){}; } bridge.postMessage = function(message){ try { var msg = (message == null) ? '' : String(message); window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COOP_BRIDGE', payload: msg })); } catch(e){} }; try { if (typeof window.AppInterFaceForCoop === 'undefined') { window.AppInterFaceForCoop = window.AppInterfaceForCoop; } } catch(_){} } catch(e){} })(); true;`;
  const injectedOpenSettingsJs = `(() => { try { if (!window.__RN_SETTINGS_CALLBACKS) window.__RN_SETTINGS_CALLBACKS = {}; window.requestOpenAppSettings = function(success, error){ const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2); const entry = { success: null, error: null, resolve: null, reject: null, t: null }; if (typeof success === 'function' || typeof error === 'function') { entry.success = typeof success === 'function' ? success : null; entry.error = typeof error === 'function' ? error : null; window.__RN_SETTINGS_CALLBACKS[id] = entry; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_OPEN_SETTINGS', id })); return; } return new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; entry.t = setTimeout(() => { delete window.__RN_SETTINGS_CALLBACKS[id]; reject(new Error('OPEN_SETTINGS timeout')); }, 10000); window.__RN_SETTINGS_CALLBACKS[id] = entry; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_OPEN_SETTINGS', id })); }); }; window.__onNativeOpenSettings = function(payload){ try { const { id, ok, error } = payload || {}; const cb = window.__RN_SETTINGS_CALLBACKS[id]; if (!cb) return; if (cb.t) { try { clearTimeout(cb.t); } catch(_){} } if (ok) { if (cb.resolve) cb.resolve(true); if (cb.success) cb.success(true); } else if (error) { if (cb.reject) cb.reject(error); if (cb.error) cb.error(error); } delete window.__RN_SETTINGS_CALLBACKS[id]; } catch(e){} }; } catch(e){} })(); true;`;
  // Helper to request native-side window open with optional title/noheader via query
  const injectedRequestWindowJs = `\n  (() => { try {\n    window.requestWindowOpen = function(url, optsOrTitle, maybeNoHeader){\n      try {\n        if (!url) return false;\n        var base = (typeof location!=='undefined')?location.href:undefined;\n        var u; try { u = new URL(String(url), base); } catch(e){ return false; }\n        var title=''; var noheader=false;\n        if (typeof optsOrTitle==='string'){ title=optsOrTitle||''; noheader=!!maybeNoHeader; }\n        else if (optsOrTitle && typeof optsOrTitle==='object'){ title=String(optsOrTitle.title||''); noheader=!!optsOrTitle.noheader; }\n        if (title){ try { u.searchParams.set('__title', encodeURIComponent(String(title))); } catch(_){ u.searchParams.set('__title', String(title)); } }\n        if (noheader){ u.searchParams.set('__no_header','1'); }\n        var finalUrl = u.toString();\n        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage){\n          window.ReactNativeWebView.postMessage(JSON.stringify({ type:'OPEN_WINDOW', url: finalUrl }));\n          return true;\n        }\n        try { location.assign(finalUrl); return true; } catch(_){ return false; }\n      } catch(e){ return false; }\n    };\n  } catch(e){} })();\n  `; 

  const { hideHeader, resolvedUrl, headerTitleFromUrl } = React.useMemo(() => {
    let hide = noHeader === '1';
    let cleaned = String(url || '');
    let presetTitle = '';
    try {
      const u = new URL(String(url));
      if (u.searchParams.get('__no_header') === '1') {
        hide = true;
        u.searchParams.delete('__no_header');
      }
      const t = u.searchParams.get('__title');
      if (t != null && String(t).length > 0) {
        try { presetTitle = decodeURIComponent(String(t)); } catch { presetTitle = String(t); }
        u.searchParams.delete('__title');
      }
      cleaned = u.toString();
    } catch {}
    return { hideHeader: hide, resolvedUrl: cleaned, headerTitleFromUrl: presetTitle };
  }, [url, noHeader]);

  const presetTitleRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (headerTitleFromUrl) {
      presetTitleRef.current = headerTitleFromUrl;
      setTitle(headerTitleFromUrl);
    }
  }, [headerTitleFromUrl]);

  if (!url) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}> 
          <Text>열 URL 이 없습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const doDefaultBack = React.useCallback(() => {
    if (canGoBack) webviewRef.current?.goBack();
    else router.back();
  }, [canGoBack, router]);

  const requestWebBackDecision = () => {
    if (pendingBackRef.current) return;
    pendingBackRef.current = true;
    const js = `(() => { try { var ret = ''; if (typeof window.eventAppToCoop === 'function') { ret = window.eventAppToCoop('HISTORY_BACK', null) || ''; } window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'APP_TO_COOP_EVENT_RESPONSE', ret: String(ret) })); } catch (e) { try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'APP_TO_COOP_EVENT_RESPONSE', ret: '' })); } catch (_) {} } })(); true;`;
    webviewRef.current?.injectJavaScript(js);
    if (backTimerRef.current) clearTimeout(backTimerRef.current);
    backTimerRef.current = setTimeout(() => {
      doDefaultBack();
      pendingBackRef.current = false;
    }, 200);
  };

  const handleBackPress = () => {
    requestWebBackDecision();
  };

  const handleClose = () => {
    router.back();
  };

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        requestWebBackDecision();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      {!hideHeader && (
        <View style={styles.header}>
          <Pressable onPress={handleBackPress} hitSlop={10} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text numberOfLines={1} style={styles.headerTitle}>{title || 'Loading...'}</Text>
          <Pressable onPress={handleClose} hitSlop={10} style={styles.headerButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>
      )}

      <WebView
        ref={webviewRef}
        source={{ uri: resolvedUrl || String(url) }}
        style={styles.webview}
        onNavigationStateChange={(st) => setCanGoBack(st.canGoBack)}
        injectedJavaScriptForMainFrameOnly={false}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
        onLoad={() => {
          try {
            // ensure helpers are present even if initial injection missed due to timing
            webviewRef.current?.injectJavaScript(injectedWindowOpenJs);
            webviewRef.current?.injectJavaScript(injectedRequestWindowJs);
            webviewRef.current?.injectJavaScript(injectedFcmJs);
            webviewRef.current?.injectJavaScript(injectedAppVersionJs);
            webviewRef.current?.injectJavaScript(injectedCoopBridgeJs);
            webviewRef.current?.injectJavaScript(injectedKakaoShareJs);
            webviewRef.current?.injectJavaScript(injectedOpenSettingsJs);
          } catch {}
        }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        originWhitelist={['http://*', 'https://*', 'sulbingapp://*', 'intent://*']}
        onShouldStartLoadWithRequest={(req) => {
          const u = req?.url || '';
          if (u.startsWith('sulbingapp://close_webview')) { router.back(); return false; }
          if (u.startsWith('intent://')) { Linking.openURL(u).catch(() => {}); return false; }
          const schemes = ['ispmobile://','kakaotalk://','payco://','samsungpay://','kftc-bankpay://','passapp://'];
          if (schemes.some((s) => u.startsWith(s))) { Linking.openURL(u).catch(() => {}); return false; }
          return true;
        }}
        onOpenWindow={(e) => {
          const targetUrl = e?.nativeEvent?.targetUrl;
          if (targetUrl) {
            if (targetUrl.startsWith('intent://')) { Linking.openURL(targetUrl).catch(() => {}); return; }
            const schemes = ['ispmobile://','kakaotalk://','payco://','samsungpay://','kftc-bankpay://','passapp://'];
            if (schemes.some((s) => targetUrl.startsWith(s))) { Linking.openURL(targetUrl).catch(() => {}); return; }
          }
        }}
        injectedJavaScriptBeforeContentLoaded={`${injectedRequestWindowJs}\n${injectedFcmJs}\n${injectedCoopBridgeJs}\n${injectedTitleObserver}\n${injectedGeolocationJs}\n${injectedWindowOpenJs}\n${injectedKakaoShareJs}\n${injectedAppVersionJs}\n${injectedOpenSettingsJs}\n${injectedBlockFirebaseJs}`}
        onMessage={(evt) => {
          try {
            const data = JSON.parse(evt.nativeEvent.data || '{}');
            if (data.type === 'OPEN_TARGET_BLANK' && data.url) {
              const u = String(data.url);
              if (u.startsWith('http://') || u.startsWith('https://')) {
                Linking.openURL(u).catch(() => {});
                return;
              }
            }
            if (data.type === 'OPEN_WINDOW' && data.url) {
              const u = String(data.url);
              const name = String(data.name || '');
              const specs = String(data.specs || '');
              const hideByName = name === 'noheader';
              const hideBySpecs = /(^|,|;)\s*noheader\b/i.test(specs);
              const hideByQuery = /[?&]__no_header=1\b/.test(u);
              const hide = hideByName || hideBySpecs || hideByQuery;
              router.push({ pathname: '/webview-view', params: { url: u, ...(hide ? { noHeader: '1' } : {}) } });
              return;
            }
            if (data.type === 'REQUEST_SHARE_KAKAO') {
              const shareUrl = String(data.url || '');
              try {
                const tryUrl = `kakaotalk://send?text=${encodeURIComponent(shareUrl)}`;
                Linking.openURL(tryUrl).catch(() => {
                  Share.share({ message: shareUrl });
                });
              } catch {}
              return;
            }
            if (data.type === 'REQUEST_APP_VERSION') {
              const id = String(data.id);
              (async () => {
                try {
                  let version = null as null | string;
                  try {
                    const v = (Constants as any)?.expoConfig?.version;
                    version = (typeof v === 'string' && v.length > 0) ? v : null;
                  } catch {}
                  const payload = { id, version };
                  webviewRef.current?.injectJavaScript(`window.__onNativeAppVersion(${JSON.stringify(payload)}); true;`);
                } catch (e: any) {
                  webviewRef.current?.injectJavaScript(`window.__onNativeAppVersion(${JSON.stringify({ id, error: { message: e?.message || 'APP_VERSION failed' } })}); true;`);
                }
              })();
              return;
            }
            if (data.type === 'COOP_BRIDGE') {
              let req: any = {};
              try { req = JSON.parse(String(data.payload || '{}')); } catch {}
              const messageId = String(req?.messageId ?? '');
              const reqType = String(req?.type ?? '');
              const reqData = req?.data ?? {};
              const sendCoopResponse = (respObj: any) => {
                const jsonStr = JSON.stringify(respObj);
                const js = `(function(){ try{ if (window.AppInterfaceForCoop && typeof window.AppInterfaceForCoop.onmessage==='function'){ window.AppInterfaceForCoop.onmessage({ data: ${JSON.stringify(jsonStr)} }); } } catch(e){} })(); true;`;
                webviewRef.current?.injectJavaScript(js);
              };
              (async () => {
                if (reqType === 'REQ_DATA_CONTACT_INFO') {
                  const Contacts = await import('expo-contacts');
                  const perm = await Contacts.requestPermissionsAsync();
                  if (perm.status !== 'granted') {
                    sendCoopResponse({
                      header: { type: 'REQ_DATA_CONTACT_INFO', messageId, data: reqData, resultCode: 'PERMISSION_DENIED', resultComment: '연락처 접근 권한이 거부되었습니다.' },
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
                      header: { type: 'REQ_DATA_CONTACT_INFO', messageId, data: reqData, resultCode: 'SUCCESS', resultComment: '연락처 정보 데이터 요청, 성공' },
                      body: { result: { contactInfo: { name: p.name, phone: p.number } } },
                    });
                  });
                  return;
                }
                // Default unknown type
                sendCoopResponse({
                  header: { type: reqType || 'unknown message type', messageId, data: reqData || {}, resultCode: 'UNKNOWN_MESSAGE_TYPE', resultComment: '알 수 없는 메시지 타입 입니다.' },
                  body: { result: {} },
                });
              })();
              return;
            }
            if (data.type === 'REQUEST_LOCATION') {
              const id = String(data.id);
              (async () => {
                try {
                  const mod = await import('expo-location');
                  const { status } = await mod.requestForegroundPermissionsAsync();
                  if (status !== 'granted') {
                    webviewRef.current?.injectJavaScript(`window.__onNativeLocation(${JSON.stringify({ id, error: { code: 1, message: 'Permission denied' } })}); true;`);
                    return;
                  }
                  const pos = await mod.getCurrentPositionAsync({ accuracy: mod.Accuracy.Balanced });
                  const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
                  webviewRef.current?.injectJavaScript(`window.__onNativeLocation(${JSON.stringify({ id, coords })}); true;`);
                } catch (e: any) {
                  webviewRef.current?.injectJavaScript(`window.__onNativeLocation(${JSON.stringify({ id, error: { message: e?.message || 'LOCATION failed' } })}); true;`);
                }
              })();
              return;
            }
            if (data.type === 'REQUEST_OPEN_SETTINGS') {
              const id = String(data.id);
              (async () => {
                try {
                  await Linking.openSettings();
                  webviewRef.current?.injectJavaScript(`window.__onNativeOpenSettings(${JSON.stringify({ id, ok: true })}); true;`);
                } catch (e: any) {
                  webviewRef.current?.injectJavaScript(`window.__onNativeOpenSettings(${JSON.stringify({ id, ok: false, error: { message: e?.message || 'OPEN_SETTINGS failed' } })}); true;`);
                }
              })();
              return;
            }
            if (data.type === 'REQUEST_FCM_TOKEN') {
              const id = String(data.id);
              (async () => {
                try {
                  // Diagnostics: config and RNFirebase default app status
                  try {
                    const rnfbApp = (await import('@react-native-firebase/app')).default as any;
                    try {
                      const appNames = (rnfbApp as any).apps?.map((a: any) => a?.name) ?? [];
                      // eslint-disable-next-line no-console
                      console.log('[RNFB][view] apps:', appNames);
                    } catch {}
                    try {
                      const opts = (rnfbApp as any)()?.options;
                      // eslint-disable-next-line no-console
                      console.log('[RNFB][view] default options:', {
                        appId: opts?.appId, projectId: opts?.projectId, hasApiKey: !!opts?.apiKey,
                      });
                    } catch (e: any) {
                      // eslint-disable-next-line no-console
                      console.log('[RNFB][view] app() error:', e?.message);
                    }
                  } catch (e: any) {
                    // eslint-disable-next-line no-console
                    console.log('[RNFB][view] import app failed:', e?.message);
                  }
                  try {
                    // eslint-disable-next-line no-console
                    console.log('[CFG][view]', {
                      variant: (Constants as any)?.expoConfig?.extra?.APP_VARIANT,
                      bundleId: (Constants as any)?.expoConfig?.ios?.bundleIdentifier,
                      googleServicesFile: (Constants as any)?.expoConfig?.ios?.googleServicesFile,
                      platform: Platform.OS,
                    });
                  } catch {}
                  const messaging = (await import('@react-native-firebase/messaging')).default;

                  if (Platform.OS === 'ios') {
                    // eslint-disable-next-line no-console
                    console.log('[FCM][view][iOS] begin');
                    await messaging().setAutoInitEnabled(true);
                    try { await messaging().registerDeviceForRemoteMessages(); /* eslint-disable-line */ } catch (e) { console.log('[FCM][view][iOS] register err', (e as any)?.message); }
                    const apns = await messaging().getAPNSToken(); console.log('[FCM][view][iOS] apns:', apns);
                    let token = await messaging().getToken(); console.log('[FCM][view][iOS] token1:', token);
                    if (!token) {
                      try { await messaging().requestPermission(); console.log('[FCM][view][iOS] permission OK'); } catch (e) { console.log('[FCM][view][iOS] permission err', (e as any)?.message); }
                      try { await messaging().registerDeviceForRemoteMessages(); /* eslint-disable-line */ } catch (e) { console.log('[FCM][view][iOS] re-register err', (e as any)?.message); }
                      try { token = await messaging().getToken(); console.log('[FCM][view][iOS] token2:', token); } catch (e) { console.log('[FCM][view][iOS] getToken err2', (e as any)?.message); }
                    }
                    webviewRef.current?.injectJavaScript(`window.__onNativeFcmToken(${JSON.stringify({ id, token, apnsToken: apns || null })}); true;`);
                    return;
                  }

                  await messaging().setAutoInitEnabled(true);
                  let token = await messaging().getToken();
                  if (!token && Platform.OS === 'android' && Platform.Version >= 33) {
                    const has = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
                    if (!has) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
                    try { await messaging().deleteToken(); } catch {}
                    await new Promise((r) => setTimeout(r, 300));
                    token = await messaging().getToken();
                  }
                  webviewRef.current?.injectJavaScript(`window.__onNativeFcmToken(${JSON.stringify({ id, token })}); true;`);
                } catch (e: any) {
                  webviewRef.current?.injectJavaScript(`window.__onNativeFcmToken(${JSON.stringify({ id, error: { message: e?.message || 'FCM token failed' } })}); true;`);
                }
              })();
              return;
            }
            if (data.type === 'APP_TO_COOP_EVENT_RESPONSE') {
              try {
                const retStr = String(data.ret || '');
                let retObj: any = {};
                try { retObj = retStr ? JSON.parse(retStr) : {}; } catch { retObj = {}; }
                const t = retObj?.type;
                if (backTimerRef.current) { clearTimeout(backTimerRef.current); backTimerRef.current = null; }
                if (t === 'REQ_WEBVIEW_HISTORY_BACK_STOP') {
                  // 웹이 자체 처리
                } else if (t === 'REQ_WEBVIEW_HISTORY_BACK_START') {
                  doDefaultBack();
                } else {
                  doDefaultBack();
                }
              } finally {
                pendingBackRef.current = false;
              }
              return;
            }
            if (data.type === 'TITLE') {
              if (!presetTitleRef.current) setTitle(data.title || '');
            }
          } catch {}
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
    backgroundColor: '#873635',
    color: '#fff',
  },
  headerButton: { width: 44, alignItems: 'center', justifyContent: 'center',color: '#fff' },
  headerButtonText: { fontSize: 22 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600',color: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  webview: { flex: 1 },
});


