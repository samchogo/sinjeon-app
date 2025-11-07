import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const injectedKakaoShareJs = `(() => { try { window.requestShareKakao = function(url){ try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_SHARE_KAKAO', url: String(url||'') })); } catch(e){} }; } catch(e){} })(); true;`;

  const { hideHeader, resolvedUrl } = React.useMemo(() => {
    let hide = noHeader === '1';
    let cleaned = String(url || '');
    try {
      const u = new URL(String(url));
      if (u.searchParams.get('__no_header') === '1') {
        hide = true;
        u.searchParams.delete('__no_header');
        cleaned = u.toString();
      }
    } catch {}
    return { hideHeader: hide, resolvedUrl: cleaned };
  }, [url, noHeader]);

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
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
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
        injectedJavaScriptBeforeContentLoaded={`${injectedTitleObserver}\n${injectedKakaoShareJs}`}
        onMessage={(evt) => {
          try {
            const data = JSON.parse(evt.nativeEvent.data || '{}');
            if (data.type === 'REQUEST_SHARE_KAKAO') {
              const shareUrl = String(data.url || '');
              try {
                const tryUrl = `kakaotalk://send?text=${encodeURIComponent(shareUrl)}`;
                Linking.openURL(tryUrl).catch(() => {
                  import('react-native').then(({ Share }) => {
                    Share.share({ message: shareUrl });
                  });
                });
              } catch {}
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
            if (data.type === 'TITLE') setTitle(data.title || '');
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


