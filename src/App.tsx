import { useEffect, useState, type ReactNode } from 'react'
import { Badge } from './components/ui'
import { GameDb, loadGameData } from './data/db'
import { cx } from './lib/cx'
import { ManualBuilder } from './features/manual/ManualBuilder'
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
    <AppStateProvider db={db}>
      <Shell />
    </AppStateProvider>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted">{children}</div>
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'manual', label: '수동 세팅' },
  { id: 'search', label: '스킬 검색' },
  { id: 'talismans', label: '내 호석' },
]

function Shell() {
  const { tab, setTab, db } = useAppState()
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <h1 className="flex items-center gap-2 text-base font-bold">
            와일즈 스킬 시뮬레이터 <Badge>비공식</Badge>
          </h1>
          <nav className="flex gap-1" aria-label="메뉴">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => setTab(t.id)}
                className={cx(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === t.id ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* 탭을 바꿔도 검색 결과 등 화면 상태가 유지되도록 모두 마운트해 두고 숨긴다 */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">
        <div hidden={tab !== 'manual'}>
          <ManualBuilder />
        </div>
        <div hidden={tab !== 'search'}>
          <SearchPage />
        </div>
        <div hidden={tab !== 'talismans'}>
          <TalismanManager />
        </div>
      </main>

      <footer className="border-t border-line px-4 py-4 text-center text-xs leading-relaxed text-muted">
        이 사이트는 캡콤의 지식재산을 이용한 비공식 팬메이드(2차 창작) 도구이며, 캡콤과 관련이 없습니다.
        <br />
        게임 데이터: MHDB (게임 파일 추출) · 데이터 기준 {db.data.meta.mhdbVersion.slice(0, 10)}
      </footer>
    </div>
  )
}
