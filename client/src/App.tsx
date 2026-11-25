/** Connects the socket, holds the authoritative snapshot, picks the screen. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { ChatMessage, GameState, PrivateState, Settings, Stroke } from '@shared/types';
import {
  getSocket,
  loadIdentity,
  loadLastRoom,
  loadSession,
  reconnectSocket,
  saveIdentity,
  saveLastRoom,
  saveSession,
  type Identity,
  type Session,
  type SessionUser,
} from './lib/net';
import { syncClock } from './lib/clock';
import { isMuted, setMuted, sfx } from './lib/sound';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import { GameScreen } from './components/GameScreen';
import { RulesModal } from './components/RulesModal';
import { Toast } from './components/Bits';
import type { ChatItem } from './components/Chat';

const NO_PRIVATE: PrivateState = { role: 'watch', title: null, fakeId: null, myVote: null };

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  // The id the server seats us under: the account when logged in, else this browser's guest id.
  const [seatId, setSeatId] = useState<string>('');
  const seatRef = useRef(seatId);
  seatRef.current = seatId;
  const [identity, setIdentity] = useState<Identity>(loadIdentity);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [state, setState] = useState<GameState | null>(null);
  const [priv, setPriv] = useState<PrivateState | null>(null);
  /** someone else's line as it streams in */
  const [remoteLive, setRemoteLive] = useState<Stroke | null>(null);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted);

  // The socket effect runs once, so it reads the identity through a ref
  // rather than re-subscribing on every keystroke in the name field.
  const identityRef = useRef(identity);
  identityRef.current = identity;

  const socket = getSocket();
  const youId = seatId;

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  /* ------------------------------------------------------------ socket */

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      // A refresh (or a dropped connection) walks straight back into the seat.
      const code = loadLastRoom();
      if (!code) return;
      const { name, avatar } = identityRef.current;
      socket.emit('room:join', { roomCode: code, name, avatar }, (res: { error?: string }) => {
        if (res?.error) {
          // The room is gone (server restarted, or the game ended long ago).
          saveLastRoom(null);
          setState(null);
        }
      });
    };
    const onDisconnect = () => setConnected(false);
    const onState = (s: GameState) => {
      syncClock(s.now);
      setState(s);
      const me = seatRef.current;
      setRemoteLive(s.live && s.live.playerId !== me ? { ...s.live, points: [...s.live.points] } : null);
    };
    const onPrivate = (p: PrivateState) => setPriv(p);
    const onError = ({ message }: { message: string }) => {
      sfx.error();
      showToast(message);
    };
    // The server tells us who it thinks we are; a stale token means logging in again.
    const onSession = ({ user, seatId }: { user: SessionUser | null; seatId?: string | null }) => {
      setSeatId(seatId ?? user?.id ?? '');
      const local = loadSession();
      if (local && !user) {
        saveSession(null);
        setSession(null);
        setState(null);
        showToast('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại');
      } else if (local && user && local.user.canHost !== user.canHost) {
        // Host rights live on the server and can change; keep our copy in step.
        const next = { ...local, user };
        saveSession(next);
        setSession(next);
      }
    };
    const onChatHistory = (msgs: ChatMessage[]) => setChat(msgs.map((m) => ({ ...m, recvAt: 0 })));
    const onChatMsg = (m: ChatMessage) => {
      // a join's announcement can arrive in the history and live; keep one
      setChat((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev.slice(-99), { ...m, recvAt: Date.now() }]));
      if (!m.system && m.playerId !== seatRef.current) sfx.chat();
    };
    const onKicked = () => {
      saveLastRoom(null);
      setState(null);
      setPriv(null);
      setChat([]);
      showToast('Chủ bàn đã mời bạn ra khỏi bàn');
    };

    const onLiveBegin = ({ playerId, color }: { playerId: string; color: number }) => setRemoteLive({ playerId, color, points: [] });
    const onLivePts = ({ pts }: { pts: number[] }) =>
      setRemoteLive((prev) => (prev ? { ...prev, points: [...prev.points, ...pts] } : prev));
    const onLiveClear = () => setRemoteLive(null);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', onState);
    socket.on('private', onPrivate);
    socket.on('errorMsg', onError);
    socket.on('session', onSession);
    socket.on('chat:history', onChatHistory);
    socket.on('chat:msg', onChatMsg);
    socket.on('kicked', onKicked);
    socket.on('live:begin', onLiveBegin);
    socket.on('live:pts', onLivePts);
    socket.on('live:clear', onLiveClear);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', onState);
      socket.off('private', onPrivate);
      socket.off('errorMsg', onError);
      socket.off('session', onSession);
      socket.off('chat:history', onChatHistory);
      socket.off('chat:msg', onChatMsg);
      socket.off('kicked', onKicked);
      socket.off('live:begin', onLiveBegin);
      socket.off('live:pts', onLivePts);
      socket.off('live:clear', onLiveClear);
    };
  }, [socket, showToast]);

  /* ----------------------------------------------------------- actions */

  const send = useCallback((event: string, payload?: unknown) => socket.emit(event, payload), [socket]);

  const login = useCallback((next: Session) => {
    saveSession(next);
    setSession(next);
    // First visit: suggest a display name from the email, which they can change.
    setIdentity((prev) => {
      if (prev.name.trim()) return prev;
      const suggested = { ...prev, name: next.user.email.split('@')[0].slice(0, 14) };
      saveIdentity(suggested);
      return suggested;
    });
    reconnectSocket();
  }, []);

  const logout = useCallback(() => {
    socket.emit('room:leave');
    saveSession(null);
    saveLastRoom(null);
    setSession(null);
    setState(null);
    setPriv(null);
    setChat([]);
    reconnectSocket();
  }, [socket]);

  const updateIdentity = useCallback((name: string, avatar: number) => {
    setIdentity((prev) => {
      const next = { ...prev, name, avatar };
      saveIdentity(next);
      return next;
    });
  }, []);

  const createRoom = useCallback(() => {
    const { name, avatar } = identity;
    socket.emit('room:create', { name, avatar }, (res: { roomCode?: string; error?: string }) => {
      if (res?.roomCode) {
        setChat([]);
        saveLastRoom(res.roomCode);
      } else if (res?.error) showToast(res.error);
    });
  }, [socket, identity, showToast]);

  const joinRoom = useCallback(
    (code: string) => {
      const { name, avatar } = identity;
      socket.emit('room:join', { roomCode: code, name, avatar }, (res: { roomCode?: string; error?: string }) => {
        if (res?.roomCode) saveLastRoom(res.roomCode);
        else if (res?.error) showToast(res.error);
      });
    },
    [socket, identity, showToast],
  );

  const leave = useCallback(() => {
    socket.emit('room:leave');
    saveLastRoom(null);
    setState(null);
    setPriv(null);
    setChat([]);
  }, [socket]);

  const sendChat = useCallback((text: string) => socket.emit('chat:send', { text }), [socket]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }, [muted]);

  /* ------------------------------------------------------------ render */

  const me = youId ? state?.players.find((p) => p.id === youId) : undefined;

  return (
    <>
      <div className="stage-bg" />
      <Toast message={toast} />

      <AnimatePresence>{rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}</AnimatePresence>

      {!state || !me ? (
        <Home
          session={session}
          onLogin={login}
          onLogout={logout}
          name={identity.name}
          avatar={identity.avatar}
          onIdentity={updateIdentity}
          onCreate={createRoom}
          onJoin={joinRoom}
          connected={connected}
          onShowRules={() => setRulesOpen(true)}
        />
      ) : state.phase === 'lobby' ? (
        <Lobby
          state={state}
          youId={youId}
          onStart={() => send('game:start')}
          onAddBot={() => send('room:addBot')}
          onKick={(id) => send('room:kick', { id })}
          onColor={(color) => send('room:color', { color })}
          onSettings={(s: Partial<Settings>) => send('room:settings', s)}
          onLeave={leave}
          onShowRules={() => setRulesOpen(true)}
          chat={chat}
          onSendChat={sendChat}
        />
      ) : (
        <GameScreen
          state={state}
          priv={priv ?? NO_PRIVATE}
          youId={youId}
          remoteLive={remoteLive}
          chat={chat}
          muted={muted}
          send={send}
          onSendChat={sendChat}
          onToggleMute={toggleMute}
          onShowRules={() => setRulesOpen(true)}
          onLeave={leave}
        />
      )}
    </>
  );
}
