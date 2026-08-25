/**
 * notedrop plugin view. Two screens, Send and Inbox, drawn for e-ink: black
 * on white, big targets, no animation, and every state change written out
 * as text because there is no other feedback channel on the device.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError, api, newId } from './src/api';
import { PERMISSIONS, device, ensurePermissions } from './src/device';
import type { InboxMessage, UserInfo } from './src/noteFormat';
import { inboxPathFor, readNote, titleFor, writeNote } from './src/transfer';

type Tab = 'send' | 'inbox';

export default function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('send');
  const [me, setMe] = useState<UserInfo | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch((e: Error) => setStatus(describe(e)));
  }, []);

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Pressable style={s.back} onPress={() => device.close()}>
          <Text style={s.backText}>‹ note</Text>
        </Pressable>
        <Text style={s.title}>notedrop</Text>
        <Text style={s.me}>{me ? me.login : '…'}</Text>
      </View>
      <View style={s.tabs}>
        <TabButton label="Send" active={tab === 'send'} onPress={() => setTab('send')} />
        <TabButton label="Inbox" active={tab === 'inbox'} onPress={() => setTab('inbox')} />
      </View>
      {tab === 'send' ? (
        <SendScreen me={me} busy={busy} setBusy={setBusy} setStatus={setStatus} />
      ) : (
        <InboxScreen busy={busy} setBusy={setBusy} setStatus={setStatus} />
      )}
      <View style={s.statusBar}>
        <Text style={s.status}>{status}</Text>
      </View>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Pressable style={[s.tab, active && s.tabActive]} onPress={onPress}>
      <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

interface ScreenProps {
  busy: boolean;
  setBusy: (b: boolean) => void;
  setStatus: (line: string) => void;
}

function SendScreen({ me, busy, setBusy, setStatus }: ScreenProps & { me: UserInfo | null }): React.ReactElement {
  const [notePath, setNotePath] = useState<string | null>(null);
  const [users, setUsers] = useState<UserInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setError(null);
    device
      .currentFilePath()
      .then(setNotePath)
      .catch(() => setNotePath(null));
    api
      .users()
      .then(setUsers)
      .catch((e: Error) => setError(describe(e)));
  }, []);

  useEffect(refresh, [refresh]);

  const send = async (to: UserInfo): Promise<void> => {
    if (!notePath) {
      setStatus('Open a note first.');
      return;
    }
    setBusy(true);
    let stage = 'permissions';
    const progress = (line: string): void => {
      stage = line;
      setStatus(line);
    };
    try {
      const denied = await ensurePermissions([PERMISSIONS.internet, PERMISSIONS.read]);
      if (denied) throw new Error(`permission refused: ${denied}. Pick "Always allow".`);
      const note = await readNote(notePath, progress);
      const elements = note.pages.reduce((n, p) => n + p.elements.length, 0);
      progress(`sending ${note.pages.length} page(s), ${elements} element(s) to ${to.login}…`);
      const r = await api.send(newId(), to.login, note);
      setStatus(`Sent "${note.title}" to ${to.name} (${r.elements} elements).`);
    } catch (e) {
      console.log(`[notedrop] send failed at "${stage}": ${(e as Error).stack ?? String(e)}`);
      setStatus(`${describe(e as Error)} (at: ${stage})`);
    } finally {
      setBusy(false);
    }
  };

  const recipients: UserInfo[] = [...(users ?? []), ...(me ? [{ login: me.login, name: `${me.name} (me)` }] : [])];

  return (
    <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
      <Text style={s.label}>This note</Text>
      <Text style={s.value}>{notePath ? titleFor(notePath) : 'No note open. Open a note, then tap notedrop.'}</Text>
      <View style={s.rowHead}>
        <Text style={s.label}>Send to</Text>
        <Pressable style={s.small} onPress={refresh} disabled={busy}>
          <Text style={s.smallText}>Refresh</Text>
        </Pressable>
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {users === null && !error ? <Text style={s.muted}>Loading people…</Text> : null}
      {users !== null && users.length === 0 ? (
        <Text style={s.muted}>No one else yet. They need to open notedrop once on their Supernote.</Text>
      ) : null}
      {recipients.map((u) => (
        <Pressable key={u.login} style={s.row} onPress={() => void send(u)} disabled={busy || !notePath}>
          <View style={s.rowMain}>
            <Text style={s.rowTitle}>{u.name}</Text>
            <Text style={s.rowSub}>{u.login}</Text>
          </View>
          <Text style={s.rowAction}>Send ›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function InboxScreen({ busy, setBusy, setStatus }: ScreenProps): React.ReactElement {
  const [items, setItems] = useState<InboxMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setError(null);
    api
      .inbox()
      .then(setItems)
      .catch((e: Error) => setError(describe(e)));
  }, []);

  useEffect(refresh, [refresh]);

  const pull = async (m: InboxMessage): Promise<string> => {
    setStatus(`fetching "${m.title}" from ${m.from}…`);
    const note = await api.note(m.id);
    const path = inboxPathFor(m.from, m.title);
    await writeNote(note, path, (line) => setStatus(`${m.title}: ${line}`));
    // Only after the note is on disk: a crash before this leaves the message
    // in the inbox, and the next pull writes it again (specs/Inbox.tla).
    await api.delivered(m.id);
    return path;
  };

  const pullOne = async (m: InboxMessage): Promise<void> => {
    setBusy(true);
    try {
      const denied = await ensurePermissions([PERMISSIONS.internet, PERMISSIONS.write, PERMISSIONS.read]);
      if (denied) throw new Error(`permission refused: ${denied}. Pick "Always allow".`);
      const path = await pull(m);
      const shown = path.replace('/storage/emulated/0/', '');
      setStatus(`Saved to ${shown}.`);
      refresh();
      // openFile is missing on older PluginHost builds; the note is already
      // safe on disk, so a failure here is cosmetic.
      try {
        await device.openFile(path, 0);
      } catch (error) {
        console.log(`[notedrop] openFile unavailable: ${(error as Error).message}`);
        setStatus(`Saved to ${shown}. Open it from Files › INBOX.`);
      }
    } catch (e) {
      console.log(`[notedrop] pull failed: ${(e as Error).stack ?? String(e)}`);
      setStatus(describe(e as Error));
    } finally {
      setBusy(false);
    }
  };

  const pullAll = async (): Promise<void> => {
    if (!items?.length) return;
    setBusy(true);
    let done = 0;
    try {
      const denied = await ensurePermissions([PERMISSIONS.internet, PERMISSIONS.write, PERMISSIONS.read]);
      if (denied) throw new Error(`permission refused: ${denied}. Pick "Always allow".`);
      for (const m of items) {
        await pull(m);
        done++;
      }
      setStatus(`Pulled ${done} note(s) into INBOX.`);
    } catch (e) {
      setStatus(`${describe(e as Error)} (${done} pulled before that)`);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
      <View style={s.rowHead}>
        <Text style={s.label}>Waiting for you</Text>
        <View style={s.rowButtons}>
          <Pressable style={s.small} onPress={refresh} disabled={busy}>
            <Text style={s.smallText}>Refresh</Text>
          </Pressable>
          <Pressable style={s.small} onPress={() => void pullAll()} disabled={busy || !items?.length}>
            <Text style={s.smallText}>Pull all</Text>
          </Pressable>
        </View>
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {items === null && !error ? <Text style={s.muted}>Checking…</Text> : null}
      {items !== null && items.length === 0 ? <Text style={s.muted}>Nothing waiting.</Text> : null}
      {(items ?? []).map((m) => (
        <Pressable key={m.id} style={s.row} onPress={() => void pullOne(m)} disabled={busy}>
          <View style={s.rowMain}>
            <Text style={s.rowTitle}>{m.title}</Text>
            <Text style={s.rowSub}>
              from {m.from} · {m.pages} page{m.pages === 1 ? '' : 's'} · {m.created_at}
            </Text>
          </View>
          <Text style={s.rowAction}>Pull ›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function describe(e: Error): string {
  if (e instanceof ApiError && e.status === 401) return 'Not recognised on the tailnet. Is Tailscale connected on this device?';
  return e.message;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  header: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#000', paddingHorizontal: 24, paddingVertical: 14 },
  back: { paddingVertical: 6, paddingRight: 18 },
  backText: { color: '#000', fontSize: 20 },
  title: { color: '#000', fontSize: 28, fontWeight: '700', flex: 1 },
  me: { color: '#444', fontSize: 15 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { backgroundColor: '#000' },
  tabText: { color: '#000', fontSize: 20 },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  body: { flex: 1 },
  bodyContent: { padding: 24, paddingBottom: 48 },
  label: { color: '#000', fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8, marginBottom: 6 },
  value: { color: '#000', fontSize: 22, marginBottom: 20 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowButtons: { flexDirection: 'row', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#000', paddingHorizontal: 18, paddingVertical: 16, marginBottom: 12 },
  rowMain: { flex: 1 },
  rowTitle: { color: '#000', fontSize: 22, fontWeight: '600' },
  rowSub: { color: '#333', fontSize: 15, marginTop: 2 },
  rowAction: { color: '#000', fontSize: 20, fontWeight: '700', paddingLeft: 12 },
  small: { borderWidth: 1, borderColor: '#000', paddingHorizontal: 14, paddingVertical: 8 },
  smallText: { color: '#000', fontSize: 16 },
  muted: { color: '#555', fontSize: 18, marginVertical: 8 },
  error: { color: '#000', fontSize: 17, marginVertical: 8, fontStyle: 'italic' },
  statusBar: { borderTopWidth: 1, borderTopColor: '#000', paddingHorizontal: 24, paddingVertical: 12, minHeight: 52 },
  status: { color: '#000', fontSize: 17 },
});
