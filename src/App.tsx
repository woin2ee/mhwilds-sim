import { useEffect, useState, type ReactNode } from 'react'
import { TabIcon } from './components/TabIcon'
import { ThemeSelect } from './components/ThemeSelect'
import { ToastProvider } from './components/ToastProvider'
import { Badge } from './components/ui'
import { GameDb, loadGameData } from './data/db'
import { cx } from './lib/cx'
import { ManualBuilder } from './features/manual/ManualBuilder'
import { SavedBuildsPage } from './features/saved/SavedBuildsPage'
import { SharedLinkHandler } from './features/saved/SharedLinkHandler'
import { SearchPage } from './features/search/SearchPage'
import { TalismanManager } from './features/talismans/TalismanManager'
import { AppStateProvider } from './state/AppState'
import { useAppState, type TabId } from './state/context'

export default function App() {
  const [db, setDb] = useState<GameDb | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadGameData()
      .then((data) => setDb(new GameDb(data)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  if (error) return <Centered>데이터를 불러오지 못했습니다: {error}</Centered>
  if (!db) return <Centered>게임 데이터를 불러오는 중…</Centered>
  return (
    <ToastProvider>
      <AppStateProvider db={db}>
        <Shell />
        <SharedLinkHandler />
      </AppStateProvider>
    </ToastProvider>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted">{children}</div>
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'manual', label: '수동 세팅' },
  { id: 'search', label: '스킬 검색' },
  { id: 'saved', label: '내 세팅' },
  { id: 'talismans', label: '내 호석' },
]

/**
 * 탭 메뉴. bar 는 휴대폰용(폭을 똑같이 나눈 밑줄 탭), pills 는 데스크톱 헤더용.
 * 아이콘은 pills 는 이름 옆, bar 는 이름 위 (휴대폰 폭에서 옆에 두면 '수동 세팅'이 넘친다)
 */
function TabNav({ variant, className }: { variant: 'bar' | 'pills'; className?: string }) {
  const { tab, setTab } = useAppState()
  return (
    <nav className={cx('flex', variant === 'pills' && 'shrink-0 gap-1', className)} aria-label="메뉴">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => setTab(t.id)}
          className={cx(
            'flex items-center justify-center font-medium transition-colors',
            variant === 'pills' && 'gap-1.5 rounded-md px-3 py-1.5 text-sm',
            variant === 'pills' && (tab === t.id ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'),
            variant === 'bar' && 'relative h-12 flex-1 flex-col gap-0.5 text-xs',
            variant === 'bar' &&
              (tab === t.id
                ? 'font-semibold text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent'
                : 'text-muted'),
          )}
        >
          <TabIcon tab={t.id} className={variant === 'pills' ? 'size-4' : 'size-5'} />
          {t.label}
        </button>
      ))}
    </nav>
  )
}

function Shell() {
  const { tab, db } = useAppState()
  return (
    <div className="flex min-h-screen flex-col">
      {/* 데스크톱(md 이상)은 제목·메뉴·테마가 한 줄인 고정 헤더. 휴대폰은 제목 줄은 스크롤되어 사라지고 아래 탭 메뉴만 위에 붙는다 */}
      <header className="border-line bg-surface md:sticky md:top-0 md:z-40 md:border-b md:bg-surface/95 md:backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-x-3 px-4 py-2.5 md:gap-x-6">
          <h1 className="flex min-w-0 items-center gap-2 text-base font-bold">
            <span className="truncate">와일즈 스킬 시뮬레이터</span> <Badge className="shrink-0">비공식</Badge>
          </h1>
          <TabNav variant="pills" className="max-md:hidden" />
          <ThemeSelect className="ml-auto shrink-0" />
        </div>
      </header>
      <TabNav variant="bar" className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur md:hidden" />

      {/* 탭을 바꿔도 검색 결과 등 화면 상태가 유지되도록 모두 마운트해 두고 숨긴다 */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">
        <div hidden={tab !== 'manual'}>
          <ManualBuilder />
        </div>
        <div hidden={tab !== 'search'}>
          <SearchPage />
        </div>
        <div hidden={tab !== 'saved'}>
          <SavedBuildsPage />
        </div>
        <div hidden={tab !== 'talismans'}>
          <TalismanManager />
        </div>
      </main>

      <footer className="border-t border-line px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center text-xs leading-relaxed text-muted">
        이 사이트는 캡콤의 지식재산을 이용한 비공식 팬메이드(2차 창작) 도구이며, 캡콤과 관련이 없습니다.
        <br />
        게임 데이터: MHDB (게임 파일 추출) · 데이터 기준 {db.data.meta.mhdbVersion.slice(0, 10)}
      </footer>
    </div>
  )
}
