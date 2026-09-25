/**
 * Landing screen. Signing in comes first: an email, then the 6-digit code
 * that was mailed to it. Only then can you pick a name and a face and
 * create (if your email is allowed to host) or join a table.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AVATAR_COUNT } from '@shared/engine';
import { useEmailLogin } from 'oink-kit/react';
import { authClient, type Session } from '../lib/net';
import { Avatar, CardBack, Logo, Marker } from './Art';
import { sfx } from '../lib/sound';

interface Props {
  session: Session | null;
  onLogin: (session: Session) => void;
  onLogout: () => void;
  name: string;
  avatar: number;
  onIdentity: (name: string, avatar: number) => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  connected: boolean;
  onShowRules: () => void;
}

/** A little still life of the box contents that floats above the form. */
function BoxContents() {
  return (
    <div className="pointer-events-none relative mx-auto -mb-2 h-20 w-64" aria-hidden>
      {[2, 7, 10, 0, 5].map((c, i) => (
        <motion.div
          key={c}
          className="absolute bottom-0 w-10"
          style={{ left: 40 + i * 26 }}
          initial={{ y: 40, opacity: 0, rotate: 0 }}
          animate={{ y: [0, -4, 0], opacity: 1, rotate: (i - 2) * 9 }}
          transition={{
            opacity: { delay: 0.2 + i * 0.08 },
            rotate: { delay: 0.2 + i * 0.08, type: 'spring', stiffness: 200 },
            y: { delay: 0.8 + i * 0.2, duration: 3, repeat: Infinity, ease: 'easeInOut' },
          }}
        >
          <CardBack color={c} className="w-full drop-shadow-sm" />
        </motion.div>
      ))}
      <motion.div
        className="absolute bottom-1 right-2"
        initial={{ rotate: 60, opacity: 0 }}
        animate={{ rotate: 38, opacity: 1 }}
        transition={{ delay: 0.7, type: 'spring' }}
      >
        <Marker color={0} size={14} />
      </motion.div>
    </div>
  );
}

export function Home(props: Props) {
  const { session, connected, onShowRules } = props;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <Logo />

        <p className="mt-2 text-center text-sm leading-relaxed text-ink-2">
          Cả bàn cùng vẽ một bức tranh — nhưng một người không biết mình đang vẽ gì.
        </p>

        <div className="mt-5">
          <BoxContents />
          <div className="panel rounded-2xl p-5">
            {/* Swap immediately; the fade is only decoration, so a paused
                animation (e.g. a background tab) can never hold the form back. */}
            <motion.div
              key={session ? 'play' : 'login'}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              {session ? <PlayForm {...props} session={session} /> : <LoginForm onLogin={props.onLogin} />}
            </motion.div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-4 text-xs">
          <button type="button" onClick={onShowRules} className="font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            Luật chơi
          </button>
          <span className="flex items-center gap-1.5 text-ink-3">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-sage' : 'animate-pulse bg-rose'}`} />
            {connected ? 'Đã kết nối máy chủ' : 'Đang kết nối…'}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

/* --------------------------------------------------------------- login */

function LoginForm({ onLogin }: { onLogin: (s: Session) => void }) {
  const login = useEmailLogin(authClient, {
    onLogin: (s) => {
      sfx.turn();
      onLogin(s);
    },
    onSent: sfx.chip,
    onError: sfx.error,
  });
  const { email, code, busy, error, notice, devCode, cooldown } = login;

  if (login.step === 'email') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void login.send();
        }}
      >
        <h2 className="display text-lg font-bold">Đăng nhập</h2>
        <p className="mt-0.5 text-xs text-ink-2">Nhập email, chúng tôi sẽ gửi cho bạn một mã 6 số.</p>

        <label className="label mt-4" htmlFor="login-email">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => login.setEmail(e.target.value)}
          placeholder="ban@vidu.com"
          className="field mt-1.5"
          autoFocus
        />
        {error && <p className="mt-2 text-xs font-semibold text-rose">{error}</p>}

        <button type="submit" disabled={!login.emailOk || busy} className="btn btn-rose mt-4 w-full">
          {busy ? 'Đang gửi…' : 'Gửi mã đăng nhập'}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void login.verify();
      }}
    >
      <h2 className="display text-lg font-bold">Nhập mã</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-2">
        Đã gửi mã tới <span className="font-semibold text-ink">{email.trim()}</span>. Xem cả thư mục Spam nếu chưa thấy.
      </p>

      <input
        ref={login.codeRef}
        value={code}
        onChange={(e) => login.typeCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="••••••"
        aria-label="Mã 6 số"
        className="field display mt-4 text-center text-3xl font-extrabold tracking-[0.5em] placeholder:tracking-[0.5em]"
        autoFocus
      />
      {devCode && (
        <p className="mt-2 rounded-lg bg-paper px-2.5 py-1.5 text-[11px] text-ink-2">
          Máy chủ chưa cấu hình gửi mail (chế độ dev) — mã là{' '}
          <button type="button" className="font-bold text-rose underline" onClick={() => void login.verify(devCode)}>
            {devCode}
          </button>
        </p>
      )}
      {notice && !error && <p className="mt-2 text-xs font-semibold text-mustard">{notice}</p>}
      {error && <p className="mt-2 text-xs font-semibold text-rose">{error}</p>}

      <button type="submit" disabled={code.length !== 6 || busy} className="btn btn-rose mt-4 w-full">
        {busy ? 'Đang kiểm tra…' : 'Xác nhận'}
      </button>

      <div className="mt-3 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={login.changeEmail}
          className="text-ink-2 hover:text-ink"
        >
          ← Đổi email
        </button>
        <button type="button" disabled={cooldown > 0 || busy} onClick={() => void login.send()} className="font-semibold text-rose disabled:text-ink-3">
          {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã'}
        </button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- play */

function PlayForm({ session, onLogout, name, avatar, onIdentity, onCreate, onJoin, connected }: Props & { session: Session }) {
  const [code, setCode] = useState('');
  const canPlay = connected && name.trim().length > 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sage" />
          <span className="truncate">{session.user.email}</span>
        </span>
        <button type="button" onClick={onLogout} className="shrink-0 text-ink-3 hover:text-ink">
          Đăng xuất
        </button>
      </div>

      <label className="label mt-4" htmlFor="player-name">
        Bút danh
      </label>
      <input
        id="player-name"
        value={name}
        maxLength={14}
        onChange={(e) => onIdentity(e.target.value, avatar)}
        placeholder="Leonardo da Vẽ…"
        className="field display mt-1.5 text-lg font-bold"
      />

      <span className="label mt-4">Chọn nhân vật</span>
      <div className="mt-2 grid grid-cols-5 gap-2">
        {Array.from({ length: AVATAR_COUNT }, (_, i) => (
          <motion.button
            key={i}
            type="button"
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              sfx.tap();
              onIdentity(name, i);
            }}
            className={`grid place-items-center rounded-xl py-1 transition ${
              avatar === i ? 'bg-rose-soft ring-2 ring-rose' : 'opacity-70 hover:bg-paper hover:opacity-100'
            }`}
            aria-label={`Nhân vật ${i + 1}`}
            aria-pressed={avatar === i}
          >
            <Avatar index={i} color={(i * 5) % 12} size={40} mood={avatar === i ? 'happy' : 'calm'} />
          </motion.button>
        ))}
      </div>

      <div className="rule my-5" />

      {session.user.canHost ? (
        <>
          <button
            type="button"
            disabled={!canPlay}
            onClick={() => {
              sfx.turn();
              onCreate();
            }}
            className="btn btn-rose w-full text-base"
          >
            Mở bàn vẽ mới
          </button>

          <div className="my-3 flex items-center gap-3 text-[11px] text-ink-3">
            <span className="h-px flex-1 bg-ink/10" />
            hoặc vào bàn có sẵn
            <span className="h-px flex-1 bg-ink/10" />
          </div>
        </>
      ) : (
        <p className="mb-3 text-xs leading-relaxed text-ink-2">Nhập mã bàn mà chủ bàn gửi cho bạn để vào chơi.</p>
      )}

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canPlay || code.length < 4) return;
          sfx.turn();
          onJoin(code);
        }}
      >
        <input
          value={code}
          onChange={(e) =>
            setCode(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 4),
            )
          }
          placeholder="MÃ BÀN"
          aria-label="Mã bàn"
          className="field display min-w-0 text-center text-lg font-extrabold tracking-[0.35em] placeholder:text-sm placeholder:font-semibold placeholder:tracking-[0.2em]"
        />
        <button type="submit" disabled={!canPlay || code.length < 4} className={`btn shrink-0 ${session.user.canHost ? 'btn-ghost' : 'btn-rose'}`}>
          Vào
        </button>
      </form>
    </div>
  );
}
