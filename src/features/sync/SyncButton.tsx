// 헤더의 동기화 버튼: 연결했을 때만 보이고, 누르면 바로 동기화한다 (구글 로그인이 끝났으면 팝업). 아이콘은 직접 그린 단순한 도형이다.
import { cx } from '../../lib/cx'
import { syncStatus, type SyncTone } from './status'
import { useSync } from './syncContext'

const TONE: Record<SyncTone, string> = {
  muted: 'text-muted hover:text-fg',
  accent: 'text-accent',
  bad: 'text-bad',
}

export function SyncButton({ className }: { className?: string }) {
  const sync = useSync()
  if (!sync.account) return null
  const { text, tone } = syncStatus(sync)
  const syncing = sync.phase === 'syncing'
  const mark = syncing || !sync.signedIn ? 'up' : sync.phase === 'error' ? 'error' : 'check'
  return (
    <button
      type="button"
      onClick={sync.syncNow}
      disabled={syncing}
      title={`Google 드라이브 동기화 · ${text}`}
      aria-label={`Google 드라이브 동기화: ${text}`}
      className={cx(
        'relative inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 pointer-coarse:size-9',
        'transition-colors disabled:cursor-default',
        TONE[tone],
        className,
      )}
    >
      <SyncIcon mark={mark} className={cx('size-4', syncing && 'animate-pulse')} />
      {tone === 'accent' && (
        <span className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-surface bg-accent" aria-hidden />
      )}
    </button>
  )
}

/** 구름 + 안쪽 표시 (check 동기화됨, up 올리기·동기화 필요, error 오류) */
export function SyncIcon({ mark, className }: { mark: 'check' | 'up' | 'error'; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M6.5 18.5a3.5 3.5 0 0 1-.4-6.98A5.5 5.5 0 0 1 16.8 10a4.25 4.25 0 0 1 .7 8.5z" />
      {mark === 'check' && <path d="m9.5 14 1.8 1.8 3.4-3.6" />}
      {mark === 'up' && <path d="M12 16.5v-4.5M10 14l2-2 2 2" />}
      {mark === 'error' && <path d="M12 11.5v2.5M12 16.4v.1" />}
    </svg>
  )
}
