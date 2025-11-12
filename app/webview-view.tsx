import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { getApps } from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Alert, BackHandler, PermissionsAndroid, Platform, Pressable, Linking as RNLinking, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// Serialize iOS FCM token requests to avoid race with remote message registration (secondary webview)
let __IOS_FCM_REQUEST_IN_FLIGHT_VIEW = false;
let __ALBUM_IN_FLIGHT_VIEW = false;

export default function WebviewViewScreen() {
  const { url, noHeader, webPayload } = useLocalSearchParams<{ url?: string; noHeader?: string; webPayload?: string }>();
  const router = useRouter();
  const webviewRef = React.useRef<WebView>(null);
  const [title, setTitle] = React.useState<string>('');
  const [canGoBack, setCanGoBack] = React.useState(false);
  const pendingBackRef = React.useRef(false);
  const backTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReadyRef = React.useRef(false);
  const pendingPushRef = React.useRef<any[]>([]);
  const deeplinkPayloadRef = React.useRef<string | undefined>(undefined);
  const [isOffline, setIsOffline] = React.useState<boolean>(false);
  const [hadLoadError, setHadLoadError] = React.useState<boolean>(false);
  const [overlayGate, setOverlayGate] = React.useState<boolean>(true);
  const openNetworkSettings = React.useCallback(() => {
    if (Platform.OS === 'android') {
      (async () => {
        const intents = [
          'intent:#Intent;action=android.settings.WIFI_SETTINGS;end',
          'intent:#Intent;action=android.settings.WIRELESS_SETTINGS;end',
          'intent:#Intent;action=android.settings.DATA_ROAMING_SETTINGS;end',
          'intent:#Intent;action=android.settings.SETTINGS;end',
        ];
        for (const it of intents) {
          const ok = await RNLinking.openURL(it).then(() => true).catch(() => false);
          if (ok) return;
        }
        try { await RNLinking.openSettings(); } catch {}
      })();
    } else {
      RNLinking.openSettings().catch(() => {});
    }
  }, []);
  React.useEffect(() => {
    deeplinkPayloadRef.current = typeof webPayload === 'string' && webPayload.length > 0 ? webPayload : undefined;
  }, [webPayload]);

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
  const injectedGeolocationJs = `(() => { try { if (!window.__RN_LOCATION_CALLBACKS) { window.__RN_LOCATION_CALLBACKS = {}; } 
    // getCurrentPosition -> native
    navigator.geolocation.getCurrentPosition = function(success, error){ try { const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2); window.__RN_LOCATION_CALLBACKS[id] = { success, error }; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_LOCATION', id })); } catch(e){} };
    // watchPosition -> emulate one-shot
    navigator.geolocation.watchPosition = function(success, error){ try { const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2); window.__RN_LOCATION_CALLBACKS[id] = { success, error }; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_LOCATION', id })); return id; } catch(e){ return null; } };
    navigator.geolocation.clearWatch = function(id){ try { if (id && window.__RN_LOCATION_CALLBACKS[id]) delete window.__RN_LOCATION_CALLBACKS[id]; } catch(e){} };
    // permissions API shim
    try { var op = navigator.permissions && navigator.permissions.query; if (op) { navigator.permissions.query = function(d){ try { if (d && d.name==='geolocation') { return Promise.resolve({ state: 'granted' }); } } catch(e){} return op.apply(this, arguments); }; } } catch(e){}
    window.__onNativeLocation = function(payload){ try { const { id, coords, error } = payload || {}; const cb = window.__RN_LOCATION_CALLBACKS[id]; if (!cb) return; if (coords && cb.success) cb.success({ coords }); else if (error && cb.error) cb.error(error); delete window.__RN_LOCATION_CALLBACKS[id]; } catch(e){} }; } catch(e){} })(); true;`;
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
  const injectedOpenExternalJs = `(() => { try { window.openExternalLink = function(url){ try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_EXTERNAL_LINK', url: String(url||'') })); } catch(e){} }; } catch(e){} })(); true;`;
  const injectedAlbumJs = `(() => { try { if (typeof window.requestAlbum!=='function'){ window.requestAlbum = function(){ try{ console.log && console.log('[ALBUM][web-view] requestAlbum() called'); }catch(_){} try { if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_ALBUM' })); return true; } } catch(e){} return false; }; try{ console.log && console.log('[ALBUM][web-view] injected'); }catch(_){} } } catch(e){} })(); true;`;
  const injectedFcmJs = `(() => { try { if (!window.__RN_FCM_CALLBACKS) window.__RN_FCM_CALLBACKS = {}; if (!window.__FB_BLOCK_CTL) window.__FB_BLOCK_CTL = { on: false, t: null }; window.requestFcmToken = function(success, error){ const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2); const entry = { success: null, error: null, resolve: null, reject: null, t: null }; try { window.__FB_BLOCK_CTL.on = true; if (window.__FB_BLOCK_CTL.t) { try { clearTimeout(window.__FB_BLOCK_CTL.t); } catch(_){} } window.__FB_BLOCK_CTL.t = setTimeout(function(){ try { window.__FB_BLOCK_CTL.on = false; } catch(_){} }, 15000); } catch(_){} if (typeof success === 'function' || typeof error === 'function') { entry.success = typeof success === 'function' ? success : null; entry.error = typeof error === 'function' ? error : null; window.__RN_FCM_CALLBACKS[id] = entry; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_FCM_TOKEN', id })); return; } return new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; entry.t = setTimeout(() => { delete window.__RN_FCM_CALLBACKS[id]; reject(new Error('FCM timeout')); }, 15000); window.__RN_FCM_CALLBACKS[id] = entry; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_FCM_TOKEN', id })); }); }; window.__onNativeFcmToken = function(payload){ try { const { id, token, osTypeCd, error } = payload || {}; const cb = window.__RN_FCM_CALLBACKS[id]; if (!cb) return; if (cb.t) { try { clearTimeout(cb.t); } catch(_){} } if (token) { var result = { token: token, osTypeCd: osTypeCd || ((/iPad|iPhone|iPod/i.test(navigator.userAgent)) ? 'IOS' : 'ANDROID') }; if (cb.resolve) cb.resolve(result); if (cb.success) cb.success(result); } else if (error) { if (cb.reject) cb.reject(error); if (cb.error) cb.error(error); } delete window.__RN_FCM_CALLBACKS[id]; } catch(e){} finally { try { if (window.__FB_BLOCK_CTL) { window.__FB_BLOCK_CTL.on = false; if (window.__FB_BLOCK_CTL.t) { try { clearTimeout(window.__FB_BLOCK_CTL.t); } catch(_){} } } } catch(_){} } }; } catch(e){} })(); true;`;
  const injectedAppVersionJs = `(() => { try { if (!window.__RN_APPVER_CALLBACKS) window.__RN_APPVER_CALLBACKS = {}; window.requestAppVersion = function(success, error){ const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2); const entry = { success: null, error: null, resolve: null, reject: null, t: null }; if (typeof success === 'function' || typeof error === 'function') { entry.success = typeof success === 'function' ? success : null; entry.error = typeof error === 'function' ? error : null; window.__RN_APPVER_CALLBACKS[id] = entry; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_APP_VERSION', id })); return; } return new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; entry.t = setTimeout(() => { delete window.__RN_APPVER_CALLBACKS[id]; reject(new Error('APP_VERSION timeout')); }, 10000); window.__RN_APPVER_CALLBACKS[id] = entry; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_APP_VERSION', id })); }); }; window.__onNativeAppVersion = function(payload){ try { const { id, version, error } = payload || {}; const cb = window.__RN_APPVER_CALLBACKS[id]; if (!cb) return; if (cb.t) { try { clearTimeout(cb.t); } catch(_){} } if (!error) { if (cb.resolve) cb.resolve(version ?? null); if (cb.success) cb.success(version ?? null); } else { if (cb.reject) cb.reject(error); if (cb.error) cb.error(error); } delete window.__RN_APPVER_CALLBACKS[id]; } catch(e){} }; } catch(e){} })(); true;`;
  const injectedCloseWindowJs = `(() => { try { const __origClose = window.close; window.close = function(){ try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_CLOSE_WINDOW', data: null })); } catch(e){} return undefined; }; window.requestWindowClose = function(data){ try { var payload = (data===undefined)?null:data; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_CLOSE_WINDOW', data: payload })); } catch(e){} return true; }; } catch(e){} })(); true;`;
  const injectedBlockFirebaseJs = `(() => { try { 
    var isFirebaseScript = function(u){ try { var s=String(u||''); return /(?:^|\/)?firebase(?:-[a-z]+)?\.js(?:$|[?#])/i.test(s) || /gstatic\.com\/firebasejs/i.test(s); } catch(e){ return false; } };
    var oa = Node && Node.prototype && Node.prototype.appendChild; if (oa) { Node.prototype.appendChild = function(c){ try { var u=(c && (c.src||c.href))||''; if (isFirebaseScript(u)) { return c; } } catch(_){} return oa.apply(this, arguments); }; }
    var oib = Node && Node.prototype && Node.prototype.insertBefore; if (oib) { Node.prototype.insertBefore = function(c){ try { var u=(c && (c.src||c.href))||''; if (isFirebaseScript(u)) { return c; } } catch(_){} return oib.apply(this, arguments); }; }
    var osa = Element && Element.prototype && Element.prototype.setAttribute; if (osa) { Element.prototype.setAttribute = function(n,v){ try { if ((n==='src'||n==='href') && isFirebaseScript(v)) { return; } } catch(_){} return osa.apply(this, arguments); };
    }
    if (!('firebase' in window)) { Object.defineProperty(window, 'firebase', { configurable: true, get: function(){ return window.__firebaseShim || (window.__firebaseShim = { apps: [], initializeApp: function(){ return {}; }, app: function(){ return {}; } }); }, set: function(_){} }); }
  } catch(e) {} })(); true;`;
  const injectedCoopBridgeJs = `(() => { try { 
    if (!window.AppInterfaceForCoop) window.AppInterfaceForCoop = {}; 
    var bridge = window.AppInterfaceForCoop; 
    if (typeof bridge.onmessage !== 'function') { bridge.onmessage = function(){}; } 
    bridge.postMessage = function(message){ 
      try { 
        var msg = (message == null) ? '' : String(message); 
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COOP_BRIDGE', payload: msg })); 
      } catch(e){} 
    }; 
    // Provide compatibility alias with different casing
    try { if (typeof window.AppInterFaceForCoop === 'undefined') { window.AppInterFaceForCoop = window.AppInterfaceForCoop; } } catch(_){} 
    // If page prefers window.AppInterfaceForCoopOnmessage, mirror it to bridge.onmessage when not set
    try { if (typeof window.AppInterfaceForCoopOnmessage === 'function' && typeof bridge.onmessage !== 'function') { bridge.onmessage = window.AppInterfaceForCoopOnmessage; } } catch(_){}
    // Also expose a global identifier so typeof AppInterfaceForCoop checks pass
    try { if (typeof AppInterfaceForCoop === 'undefined') { Function('var AppInterfaceForCoop = window.AppInterfaceForCoop;')(); } } catch(_){} 
  } catch(e){} })(); true;`;
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

  // Fallback title: derive from URL when document.title isn't available
  React.useEffect(() => {
    if (presetTitleRef.current) return;
    if (title && title !== 'Loading...') return;
    // If we can't read a meaningful title, use the app name as a friendly default.
    setTitle('설빙');
  }, [resolvedUrl, url, title]);

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

  // Network status listener
  React.useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const offline = state.isInternetReachable === false || state.type === 'none';
      setIsOffline(!!offline);
      if (!offline && hadLoadError) {
        setHadLoadError(false);
        try { webviewRef.current?.reload(); } catch {}
      }
    });
    return () => { try { sub(); } catch {} };
  }, [hadLoadError]);

  // Optional: background auto-retry when offline or load error
  React.useEffect(() => {
    if (!(isOffline || hadLoadError)) return;
    const t = setInterval(() => {
      NetInfo.fetch().then((s) => {
        const offline = s.isInternetReachable === false || s.type === 'none';
        if (!offline) {
          setHadLoadError(false);
          try { webviewRef.current?.reload(); } catch {}
        }
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [isOffline, hadLoadError]);

  // Listen for push click events and forward to this WebView as well
  React.useEffect(() => {
    let off: any;
    (async () => {
      try {
        const { eventBus } = await import('@/lib/event-bus');
        off = eventBus.on('PUSH_CLICKED', ({ payload }) => {
          if (!isReadyRef.current) {
            pendingPushRef.current.push(payload);
            // eslint-disable-next-line no-console
            console.log('[PUSH][view][buffer]', payload);
            return;
          }
          // eslint-disable-next-line no-console
          console.log('[PUSH][view][inject]', payload);
          const js = `(function(){ try{ if (typeof window.pushTypeHandler==='function'){ window.pushTypeHandler(${JSON.stringify(
            payload
          )}); } }catch(e){} })(); true;`;
          webviewRef.current?.injectJavaScript(js);
        });
        // Listen deeplink payload and inject with logs and retry
        (eventBus as any).on('DEEPLINK_WEB', (p: any) => {
          try {
            const payload = p && 'payload' in p ? String(p.payload) : '';
            try { setHadLoadError(false); setIsOffline(false); setOverlayGate(false); setTimeout(() => setOverlayGate(true), 1500); } catch {}
            if (!isReadyRef.current) {
              pendingPushRef.current.push({ __DL__: payload });
              // eslint-disable-next-line no-console
              console.log('[DL][view][buffer]', payload);
              return;
            }
            // eslint-disable-next-line no-console
            console.log('[DL][view][inject]', payload);
            const js = `(function(){ try{ var v=${JSON.stringify(
              String(payload)
            )}; var __t=0; function __call(){ try{ var has=(typeof window.handleDeeplink==='function'); try{ console.log('[DL][web] try', __t+1, 'has=', has); }catch(_){}; if (has){ try{ window.handleDeeplink(v); try{ console.log('[DL][web] done'); }catch(_){ } }catch(e){ try{ console.log('[DL][web] error', e&&e.message); }catch(_){ } } } else if (++__t<3){ setTimeout(__call, 300); } }catch(e){} } __call(); }catch(e){} })(); true;`;
            webviewRef.current?.injectJavaScript(js);
          } catch {}
        });
      } catch {}
    })();
    return () => {
      try { off && off(); } catch {}
      // Fallback: if this view is being closed without explicit requestWindowClose, notify parent with null
      try {
        import('@/lib/event-bus').then(({ eventBus }) => {
          try { (eventBus as any).emit('WINDOW_CHILD_CLOSED', { data: null }); } catch {}
        }).catch(() => {});
      } catch {}
    };
  }, []);

  // Mark child webview active while this screen is mounted
  React.useEffect(() => {
    try { (global as any).__WEB_CHILD_ACTIVE = true; } catch {}
    return () => { try { (global as any).__WEB_CHILD_ACTIVE = false; } catch {} };
  }, []);

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
        onError={() => setHadLoadError(true)}
        onHttpError={() => setHadLoadError(true)}
        injectedJavaScriptForMainFrameOnly={false}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
        onLoad={() => {
          try {
            setHadLoadError(false);
            isReadyRef.current = true;
            // Ensure a fallback handleDeeplink exists on the page
            const injectedFallbackHandle = `(function(){try{ if (typeof window.handleDeeplink!=='function'){ window.handleDeeplink=function(p){ try{ var s=String(p||''); try{ s=decodeURIComponent(s);}catch(_){ } if (/^https?:\\/\\//i.test(s)){ location.assign(s); return; } var path=(s && s.charAt(0)==='/')?s:('/'+s); if (typeof navigateTo==='function'){ try{ navigateTo(path); return; }catch(e){} } if (window.$nuxt && window.$nuxt.$router){ try{ window.$nuxt.$router.push(path); return; }catch(e){} } location.assign(path); }catch(e){} }; } }catch(e){} })(); true;`;
            webviewRef.current?.injectJavaScript(injectedFallbackHandle);
            // ensure helpers are present even if initial injection missed due to timing
            webviewRef.current?.injectJavaScript(injectedWindowOpenJs);
            webviewRef.current?.injectJavaScript(injectedRequestWindowJs);
            webviewRef.current?.injectJavaScript(injectedCloseWindowJs);
            webviewRef.current?.injectJavaScript(injectedFcmJs);
            webviewRef.current?.injectJavaScript(injectedAppVersionJs);
            webviewRef.current?.injectJavaScript(injectedCoopBridgeJs);
            webviewRef.current?.injectJavaScript(injectedKakaoShareJs);
            webviewRef.current?.injectJavaScript(injectedOpenExternalJs);
            webviewRef.current?.injectJavaScript(injectedOpenSettingsJs);
            // drain any pending push payloads
            try {
              const list = pendingPushRef.current;
              pendingPushRef.current = [];
              for (const pl of list) {
                // eslint-disable-next-line no-console
                console.log('[PUSH][view][inject-drain]', pl);
                const js = `(function(){ try{ if (typeof window.pushTypeHandler==='function'){ window.pushTypeHandler(${JSON.stringify(
                  pl
                )}); } }catch(e){} })(); true;`;
                webviewRef.current?.injectJavaScript(js);
              }
            } catch {}
            // inject deeplink payload to window.handleDeeplink if provided
            try {
              const payload = deeplinkPayloadRef.current;
              if (payload) {
                const jsDeeplink = `(function(){try{var v=${JSON.stringify(
                  String(payload)
                )}; if (typeof window.handleDeeplink==='function'){ window.handleDeeplink(v); } else { try{ console.log('[DL][web] handleDeeplink not defined'); }catch(_){} setTimeout(function(){ try{ if (typeof window.handleDeeplink==='function'){ window.handleDeeplink(v); } }catch(e){} }, 300); } }catch(e){} })(); true;`;
                webviewRef.current?.injectJavaScript(jsDeeplink);
              }
            } catch {}
            // drain any global deeplink queue buffered by tabs when child was active
            try {
              const root: any = (global as any);
              const q = root && Array.isArray(root.__DEEPLINK_WEB_QUEUE) ? root.__DEEPLINK_WEB_QUEUE : [];
              if (q && q.length) {
                root.__DEEPLINK_WEB_QUEUE = [];
                for (const pl of q) {
                  // eslint-disable-next-line no-console
                  console.log('[DL][view][inject-drain-global]', pl);
                  const js = `(function(){ try{ var v=${JSON.stringify(
                    String(pl)
                  )}; var __t=0; function __call(){ try{ var has=(typeof window.handleDeeplink==='function'); try{ console.log('[DL][web] try', __t+1, 'has=', has); }catch(_){}; if (has){ try{ window.handleDeeplink(v); try{ console.log('[DL][web] done'); }catch(_){ } }catch(e){ try{ console.log('[DL][web] error', e&&e.message); }catch(_){ } } } else if (++__t<3){ setTimeout(__call, 300); } }catch(e){} } __call(); }catch(e){} })(); true;`;
                  webviewRef.current?.injectJavaScript(js);
                }
              }
            } catch {}
          } catch {}
        }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        geolocationEnabled={false}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={(req) => {
          const u = req?.url || '';
          if (isOffline) { return false; }
          if (u.startsWith('sulbingapp://close_webview')) { router.back(); return false; }
          const openExternal = (url: string) => {
            if (!url) return;
            if (/^intent:/i.test(url)) {
              Linking.openURL(url).catch(() => {
                try {
                  const schemeMatch = url.match(/#Intent;.*?scheme=([^;]+).*?;end/i);
                  const scheme = schemeMatch && schemeMatch[1];
                  const pathPart = url.replace(/^intent:\/\//i, '').split('#Intent')[0];
                  if (scheme) {
                    const schemeUrl = `${scheme}://${pathPart}`;
                    Linking.canOpenURL(schemeUrl)
                      .then((can) => {
                        if (can) {
                          Linking.openURL(schemeUrl).catch(() => {});
                          return;
                        }
                        const fb = url.match(/;S\\.browser_fallback_url=([^;]+)/i);
                        if (fb && fb[1]) {
                          const fallback = decodeURIComponent(fb[1]);
                          Linking.openURL(fallback).catch(() => {});
                          return;
                        }
                        const m = url.match(/;package=([^;]+)/i);
                        const pkg = m && m[1];
                        if (pkg) Linking.openURL(`market://details?id=${pkg}`).catch(() => {});
                      })
                      .catch(() => {
                        const fb = url.match(/;S\\.browser_fallback_url=([^;]+)/i);
                        if (fb && fb[1]) {
                          const fallback = decodeURIComponent(fb[1]);
                          Linking.openURL(fallback).catch(() => {});
                          return;
                        }
                        const m = url.match(/;package=([^;]+)/i);
                        const pkg = m && m[1];
                        if (pkg) Linking.openURL(`market://details?id=${pkg}`).catch(() => {});
                      });
                    return;
                  }
                  const fb = url.match(/;S\\.browser_fallback_url=([^;]+)/i);
                  if (fb && fb[1]) {
                    const fallback = decodeURIComponent(fb[1]);
                    Linking.openURL(fallback).catch(() => {});
                    return;
                  }
                  const m = url.match(/;package=([^;]+)/i);
                  const pkg = m && m[1];
                  if (pkg) Linking.openURL(`market://details?id=${pkg}`).catch(() => {});
                } catch {}
              });
              return;
            }
            if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:/i.test(url)) {
              Linking.canOpenURL(url).then((can) => {
                const doAndroidStoreFallback = (schemeOnly: string) => {
                  const scheme = schemeOnly;
                  if (Platform.OS === 'ios') {
                    const iosStoreMap: Record<string, string> = {
                      kakaotalk: 'itms-apps://itunes.apple.com/app/id362057947',
                      payco: 'itms-apps://itunes.apple.com/app/id924292102',
                    };
                    const iosUrl = iosStoreMap[scheme];
                    if (iosUrl) { Linking.openURL(iosUrl).catch(() => {}); return; }
                  }
                  const pkgMap: Record<string, string> = {
                    'kakaotalk': 'com.kakao.talk',
                    'ispmobile': 'kvp.jjy.MispAndroid320',
                    'kb-acp': 'com.kbcard.cxh.appcard',
                    'kftc-bankpay': 'com.kftc.bankpay.android',
                    'payco': 'com.nhnent.payapp',
                    'samsungpay': 'com.samsung.android.spay',
                    'lpayapp': 'com.lottemembers.android',
                    'tmoney': 'com.lgt.tmoney',
                  };
                  const pkg = pkgMap[scheme];
                  if (pkg) {
                    Linking.openURL(`market://details?id=${pkg}`).catch(() => {});
                  } else {
                    Linking.openURL(`market://search?q=${encodeURIComponent(scheme)}`).catch(() => {});
                  }
                };
                const doIosStoreFallback = (_schemeOnly: string) => {
                  try {
                    // eslint-disable-next-line no-console
                    console.log('[PAY][iOS][fallback] show alert for missing app');
                    setTimeout(() => Alert.alert('', '결제 앱 설치 후 이용해 주세요', [{ text: '확인' }]), 0);
                  } catch {}
                };
                if (can) {
                  Linking.openURL(url).catch(() => {
                    const schemeOnly = String(url.split(':')[0] || '').toLowerCase();
                    if (Platform.OS === 'android') doAndroidStoreFallback(schemeOnly);
                    else doIosStoreFallback(schemeOnly);
                  });
                } else {
                  const schemeOnly = String(url.split(':')[0] || '').toLowerCase();
                  if (Platform.OS === 'android') doAndroidStoreFallback(schemeOnly);
                  else doIosStoreFallback(schemeOnly);
                }
              }).catch(() => {});
              return;
            }
          };
          if (u.startsWith('intent://')) { openExternal(u); return false; }
          // Allow http/https in WebView; open other custom schemes externally
          if (/^https?:\/\//i.test(u)) return true;
          if (/^[a-z][a-z0-9+.-]*:/i.test(u)) { openExternal(u); return false; }
          return true;
        }}
        onOpenWindow={(e) => {
          const targetUrl = e?.nativeEvent?.targetUrl;
          if (!targetUrl) return;
          const openExternal = (url: string) => {
            if (!url) return;
            if (url.startsWith('intent://')) {
              Linking.openURL(url).catch(() => {
                try {
                  const fb = url.match(/;S\\.browser_fallback_url=([^;]+)/i);
                  if (fb && fb[1]) {
                    const fallback = decodeURIComponent(fb[1]);
                    Linking.openURL(fallback).catch(() => {});
                    return;
                  }
                  const m = url.match(/;package=([^;]+)/i);
                  const pkg = m && m[1];
                  if (pkg) Linking.openURL(`market://details?id=${pkg}`).catch(() => {});
                } catch {}
              });
              return;
            }
            if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:/i.test(url)) {
              Linking.canOpenURL(url).then((can) => {
                const doAndroidStoreFallback = (scheme: string) => {
                  const pkgMap: Record<string, string> = {
                    'kakaotalk': 'com.kakao.talk',
                    'ispmobile': 'kvp.jjy.MispAndroid320',
                    'kb-acp': 'com.kbcard.cxh.appcard',
                    'kftc-bankpay': 'com.kftc.bankpay.android',
                    'payco': 'com.nhnent.payapp',
                    'samsungpay': 'com.samsung.android.spay',
                    'lpayapp': 'com.lottemembers.android',
                    'tmoney': 'com.lgt.tmoney',
                  };
                  const pkg = pkgMap[scheme];
                  if (pkg) {
                    Linking.openURL(`market://details?id=${pkg}`).catch(() => {});
                  } else {
                    Linking.openURL(`market://search?q=${encodeURIComponent(scheme)}`).catch(() => {});
                  }
                };
                const doIosStoreFallback = (_scheme: string) => {
                  try { Alert.alert('안내', '결제 앱 설치 후 이용해 주세요'); } catch {}
                };
                if (can) {
                  Linking.openURL(url).catch(() => {
                    const schemeOnly = String(url.split(':')[0] || '').toLowerCase();
                    if (Platform.OS === 'android') doAndroidStoreFallback(schemeOnly);
                    else doIosStoreFallback(schemeOnly);
                  });
                } else {
                  const schemeOnly = String(url.split(':')[0] || '').toLowerCase();
                  if (Platform.OS === 'android') doAndroidStoreFallback(schemeOnly);
                  else doIosStoreFallback(schemeOnly);
                }
              }).catch(() => {
                if (Platform.OS === 'ios') {
                  try { setTimeout(() => Alert.alert('', '결제 앱 설치 후 이용해 주세요', [{ text: '확인' }]), 0); } catch {}
                }
              });
              return;
            }
          };
          if (targetUrl.startsWith('intent://')) { openExternal(targetUrl); return; }
          if (/^https?:\/\//i.test(targetUrl)) {
            const js = `location.href=${JSON.stringify(targetUrl)}; true;`;
            webviewRef.current?.injectJavaScript(js);
            return;
          }
          // Non-http(s) schemes open externally
          if (/^[a-z][a-z0-9+.-]*:/i.test(targetUrl)) { openExternal(targetUrl); return; }
        }}
        injectedJavaScriptBeforeContentLoaded={`${injectedRequestWindowJs}\n${injectedCloseWindowJs}\n${injectedFcmJs}\n${injectedCoopBridgeJs}\n${injectedTitleObserver}\n${injectedGeolocationJs}\n${injectedWindowOpenJs}\n${injectedKakaoShareJs}\n${injectedOpenExternalJs}\n${injectedAlbumJs}\n${injectedAppVersionJs}\n${injectedOpenSettingsJs}\n${injectedBlockFirebaseJs}`}
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
              // Load in the same WebView
              const js = `location.href=${JSON.stringify(u)}; true;`;
              webviewRef.current?.injectJavaScript(js);
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
            if (data.type === 'OPEN_EXTERNAL_LINK' && data.url) {
              const u = String(data.url);
              Linking.openURL(u).catch(() => {});
              return;
            }
            if (data.type === 'REQUEST_ALBUM') {
              (async () => {
                try {
                  // eslint-disable-next-line no-console
                  console.log('[ALBUM][view] received REQUEST_ALBUM');
                  if (__ALBUM_IN_FLIGHT_VIEW) {
                    console.log('[ALBUM][view] skip: already in flight');
                    return;
                  }
                  __ALBUM_IN_FLIGHT_VIEW = true;
                  const ImagePicker = await import('expo-image-picker');
                  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                  // eslint-disable-next-line no-console
                  console.log('[ALBUM][view] permission', perm?.granted);
                  if (!perm.granted) {
                    webviewRef.current?.injectJavaScript(`(function(){ try{ if (typeof window.onAlbumPhoto==='function'){ window.onAlbumPhoto(null); } }catch(e){} })(); true;`);
                    __ALBUM_IN_FLIGHT_VIEW = false;
                    return;
                  }
                  const picked = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: false,
                    quality: 0.7,
                    base64: true,
                    exif: false,
                    selectionLimit: 1,
                    allowsMultipleSelection: false,
                    presentationStyle: 'fullScreen' as any,
                  });
                  // eslint-disable-next-line no-console
                  console.log('[ALBUM][view] picked', picked && (picked as any).canceled === false ? 'ok' : 'cancel');
                  if (!picked || (picked as any).canceled || !picked.assets || picked.assets.length === 0) {
                    webviewRef.current?.injectJavaScript(`(function(){ try{ if (typeof window.onAlbumPhoto==='function'){ window.onAlbumPhoto(null); } }catch(e){} })(); true;`);
                    __ALBUM_IN_FLIGHT_VIEW = false;
                    return;
                  }
                  const asset: any = picked.assets[0] || {};
                  // eslint-disable-next-line no-console
                  console.log('[ALBUM][view] asset', { uri: asset?.uri, w: asset?.width, h: asset?.height });
                  const b64: string | null = asset?.base64 ?? null;
                  try { console.log('[ALBUM][view] base64 length', b64 ? b64.length : 0); } catch {}
                  const photo = {
                    uri: asset.uri || null,
                    width: 'width' in asset ? asset.width : null,
                    height: 'height' in asset ? asset.height : null,
                    fileName: asset?.fileName ?? null,
                    fileSize: asset?.fileSize ?? null,
                    mimeType: asset?.mimeType ?? null,
                    type: 'image',
                    base64: b64,
                  };
                  const js = `(function(){ try{ var has = (typeof window.onAlbumPhoto==='function'); if (!has) { try{ console.log('[ALBUM][web] onAlbumPhoto not defined'); }catch(_){} } if (has) { window.onAlbumPhoto(${JSON.stringify(photo)}); } }catch(e){ try{ console.log('[ALBUM][web] onAlbumPhoto error', e&&e.message); }catch(_){ } } })(); true;`;
                  webviewRef.current?.injectJavaScript(js);
                } catch {
                  // eslint-disable-next-line no-console
                  console.log('[ALBUM][view] error');
                  webviewRef.current?.injectJavaScript(`(function(){ try{ if (typeof window.onAlbumPhoto==='function'){ window.onAlbumPhoto(null); } }catch(e){} })(); true;`);
                } finally {
                  __ALBUM_IN_FLIGHT_VIEW = false;
                }
              })();
              return;
            }
            if (data.type === 'REQUEST_CLOSE_WINDOW') {
              try {
                const payload = (data && 'data' in data) ? (data as any).data : null;
                import('@/lib/event-bus').then(({ eventBus }) => {
                  try { (eventBus as any).emit('WINDOW_CHILD_CLOSED', { data: payload ?? null }); } catch {}
                }).catch(() => {});
              } catch {}
              router.back();
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
                // eslint-disable-next-line no-console
                console.log('[COOP][view][send]', respObj);
                const js = `(function(){ try{
                  var ev = { data: ${JSON.stringify(jsonStr)} };
                  var h1 = (window.AppInterfaceForCoop && typeof window.AppInterfaceForCoop.onmessage==='function') ? window.AppInterfaceForCoop.onmessage : null;
                  var h2 = (typeof window.AppInterfaceForCoopOnmessage==='function') ? window.AppInterfaceForCoopOnmessage : null;
                  if (h1){ try{ h1(ev); }catch(e){} }
                  if (h2){ try{ h2(ev); }catch(e){} }
                } catch(e){} })(); true;`;
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
                    const appNames = getApps?.().map((a: any) => a?.name) ?? [];
                    // eslint-disable-next-line no-console
                    console.log('[RNFB][view] apps:', appNames);
                    try {
                      const opts = messaging().app.options;
                      console.log('[RNFB][view] default options:', {
                        appId: opts?.appId, projectId: opts?.projectId, hasApiKey: !!opts?.apiKey,
                      });
                    } catch (e: any) {
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
                  if (Platform.OS === 'ios') {
                    if (__IOS_FCM_REQUEST_IN_FLIGHT_VIEW) {
                      for (let i = 0; i < 20 && __IOS_FCM_REQUEST_IN_FLIGHT_VIEW; i++) {
                        await new Promise((r) => setTimeout(r, 150));
                      }
                    }
                    __IOS_FCM_REQUEST_IN_FLIGHT_VIEW = true;
                    // eslint-disable-next-line no-console
                    console.log('[FCM][view][iOS] begin');
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
                        console.log('[FCM][view][iOS] isRegistered:', !!registered);
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
                          console.log('[FCM][view][iOS] registered now:', registered);
                        }
                      } catch (e) { console.log('[FCM][view][iOS] register err', (e as any)?.message); }
                      const apns = await messaging().getAPNSToken(); console.log('[FCM][view][iOS] apns:', apns);
                      let token: string | undefined;
                      try {
                        await new Promise((r) => setTimeout(r, 150));
                        token = await messaging().getToken();
                        console.log('[FCM][view][iOS] token1:', token);
                      } catch (e) {
                        console.log('[FCM][view][iOS] getToken err1', (e as any)?.message);
                      }
                      if (!token) {
                        try { await messaging().registerDeviceForRemoteMessages(); /* eslint-disable-line */ await new Promise((r) => setTimeout(r, 200)); } catch (e) { console.log('[FCM][view][iOS] re-register err', (e as any)?.message); }
                        try { token = await messaging().getToken(); console.log('[FCM][view][iOS] token2:', token); } catch (e) { console.log('[FCM][view][iOS] getToken err2', (e as any)?.message); }
                      }
                      webviewRef.current?.injectJavaScript(`window.__onNativeFcmToken(${JSON.stringify({ id, token, osTypeCd: 'IOS', apnsToken: apns || null })}); true;`);
                      return;
                    } finally {
                      __IOS_FCM_REQUEST_IN_FLIGHT_VIEW = false;
                    }
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
                  webviewRef.current?.injectJavaScript(`window.__onNativeFcmToken(${JSON.stringify({ id, token, osTypeCd: 'ANDROID' })}); true;`);
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

      {(overlayGate && (isOffline || hadLoadError)) && (
        <View style={styles.offlineOverlay}>
          <Text style={styles.offlineText}>단말의 통신상태가 오프라인입니다.{'\n'}네트워크 연결을 확인해 주세요.</Text>
          <View style={styles.offlineActions}>
            <Pressable onPress={() => { try { webviewRef.current?.reload(); } catch {} }} style={styles.offlineBtn}>
              <Text style={{ color: '#fff' }}>다시 시도</Text>
            </Pressable>
            <Pressable onPress={openNetworkSettings} style={styles.offlineBtnSecondary}>
              <Text style={{ color: '#fff' }}>설정 열기</Text>
            </Pressable>
          </View>
        </View>
      )}
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
  offlineOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  offlineText: {
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  offlineIcon: {
    width: 64,
    height: 64,
    marginBottom: 12,
    resizeMode: 'contain',
  },
  offlineActions: {
    flexDirection: 'row',
    gap: 12,
  } as any,
  offlineBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#863534',
    borderRadius: 6,
    marginHorizontal: 6,
  },
  offlineBtnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#444',
    borderRadius: 6,
    marginHorizontal: 6,
  },
});


