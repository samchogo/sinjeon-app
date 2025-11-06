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

  const handleBackPress = () => {
    if (canGoBack) webviewRef.current?.goBack();
    else router.back();
  };

  const handleClose = () => {
    router.back();
  };

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (canGoBack) {
          webviewRef.current?.goBack();
        } else {
          router.back();
        }
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [canGoBack, router])
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
        injectedJavaScriptBeforeContentLoaded={injectedTitleObserver}
        onMessage={(evt) => {
          try {
            const data = JSON.parse(evt.nativeEvent.data || '{}');
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


