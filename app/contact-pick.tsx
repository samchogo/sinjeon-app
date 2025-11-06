import { eventBus } from '@/lib/event-bus';
import * as Contacts from 'expo-contacts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ContactPickScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<Contacts.Contact[]>([]);
  const [q, setQ] = React.useState('');

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Contacts.getPermissionsAsync();
        if (status !== 'granted') {
          setItems([]);
          setLoading(false);
          return;
        }
        const res = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers] });
        if (!mounted) return;
        setItems(res.data || []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onSelect = (c: Contacts.Contact) => {
    const number = c.phoneNumbers && c.phoneNumbers[0]?.number;
    if (!id || !c.name || !number) return router.back();
    eventBus.emit('CONTACT_PICKED', { id: String(id), name: c.name, number });
    router.back();
  };

  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((c) => (c.name || '').toLowerCase().includes(query) || (c.phoneNumbers?.some(p => (p.number||'').toLowerCase().includes(query))));
  }, [items, q]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerButton}><Text style={styles.headerButtonText}>×</Text></Pressable>
        <Text style={styles.headerTitle}>연락처 선택</Text>
        <View style={styles.headerButton} />
      </View>
      <View style={styles.searchRow}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="이름 또는 번호 검색"
          style={styles.search}
        />
      </View>
      {loading ? (
        <View style={styles.centered}><Text>불러오는 중…</Text></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable style={styles.item} onPress={() => onSelect(item)}>
              <Text style={styles.itemName}>{item.name || '이름 없음'}</Text>
              <Text style={styles.itemSub}>{item.phoneNumbers && item.phoneNumbers[0]?.number ? item.phoneNumbers[0].number : '번호 없음'}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<View style={styles.centered}><Text>연락처가 없습니다.</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e5' },
  headerButton: { width: 44, alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { fontSize: 22 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  searchRow: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  search: { height: 40, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  item: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  itemName: { fontSize: 16, fontWeight: '500' },
  itemSub: { fontSize: 13, color: '#666', marginTop: 2 },
});


