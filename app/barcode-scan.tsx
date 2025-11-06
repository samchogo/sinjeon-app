import { eventBus } from '@/lib/event-bus';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BarcodeScanScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const [hasPermission, setHasPermission] = React.useState<boolean | null>(null);
  const [scanned, setScanned] = React.useState(false);
  const [CameraComp, setCameraComp] = React.useState<any>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import('expo-camera');
        if (!mounted) return;
        setCameraComp(() => mod.CameraView);
        const { status } = await mod.Camera.requestCameraPermissionsAsync();
        if (!mounted) return;
        setHasPermission(status === 'granted');
      } catch (e: any) {
        if (!mounted) return;
        setLoadError(e?.message ?? 'Failed to load scanner');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    if (id) {
      eventBus.emit('SCAN_RESULT', { id: String(id), code: String(data) });
    }
    router.back();
  };

  const handleCancel = () => {
    router.back();
  };

  if (loadError) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text>{loadError}</Text>
        <Text style={{ marginTop: 8 }}>Dev Client 또는 재빌드가 필요할 수 있습니다.</Text>
        <Pressable onPress={() => router.back()} style={styles.button}><Text style={styles.buttonText}>닫기</Text></Pressable>
      </SafeAreaView>
    );
  }

  if (hasPermission === null || !CameraComp) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text>카메라 권한 확인 중…</Text>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text>카메라 권한이 없습니다.</Text>
        <Pressable onPress={handleCancel} style={styles.button}><Text style={styles.buttonText}>닫기</Text></Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={handleCancel} hitSlop={10} style={styles.headerButton}><Text style={styles.headerButtonText}>×</Text></Pressable>
        <Text style={styles.headerTitle}>바코드 스캔</Text>
        <View style={styles.headerButton} />
      </View>
      <View style={styles.scannerContainer}>
        <CameraComp
          facing="back"
          onBarcodeScanned={handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      {scanned && (
        <View style={styles.footer}><Text>처리 중…</Text></View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  headerButton: { width: 44, alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { fontSize: 22 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  scannerContainer: { height: 300, width: '100%', backgroundColor: '#000', alignSelf: 'center' },
  footer: { height: 48, alignItems: 'center', justifyContent: 'center' },
  button: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#111', borderRadius: 6 },
  buttonText: { color: '#fff' },
});


