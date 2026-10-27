import { useCallback, useMemo, type ReactNode } from 'react'
import type { SavedBuild } from '../core/savedBuilds'
import { emptyBuild, type BuildState, type CustomTalisman } from '../core/types'
import type { GameDb } from '../data/db'
import { useScrollMemory } from '../lib/scroll'
import { usePersistentState } from '../lib/storage'
import { AppStateContext, type TabId } from './context'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function isBuildState(v: unknown): v is BuildState {
  return isObject(v) && isObject(v.armor) && isObject(v.decorations)
}

function isTalismanList(v: unknown): v is CustomTalisman[] {
  return Array.isArray(v) && v.every((t) => isObject(t) && typeof t.id === 'string' && Array.isArray(t.skills))
}

function isSavedBuildList(v: unknown): v is SavedBuild[] {
  return Array.isArray(v) && v.every((s) => isObject(s) && typeof s.id === 'string' && isBuildState(s.build))
}

const isTab = (v: unknown): v is TabId =>
  v === 'manual' || v === 'search' || v === 'dictionary' || v === 'saved' || v === 'talismans' || v === 'backup'
const isNullableString = (v: unknown): v is string | null => v === null || typeof v === 'string'

/** 앱 전역 상태. 호석·수동 세팅·내 세팅·현재 탭은 localStorage 에 자동 저장된다. */
export function AppStateProvider({ db, children }: { db: GameDb; children: ReactNode }) {
  const [customTalismans, setCustomTalismans] = usePersistentState<CustomTalisman[]>(
    'talismans:v1',
    [],
    isTalismanList,
  )
  const [manualBuild, setManualBuild] = usePersistentState<BuildState>('manual-build:v1', emptyBuild, isBuildState)
  const [savedBuilds, setSavedBuilds] = usePersistentState<SavedBuild[]>('saved-builds:v1', [], isSavedBuildList)
  const [manualSourceId, setManualSourceId] = usePersistentState<string | null>(
    'manual-source:v1',
    null,
    isNullableString,
  )
  const [tab, setTabState] = usePersistentState<TabId>('tab', 'manual', isTab)
  // 탭마다 스크롤 위치를 기억해, 탭을 오가도 보던 자리로 돌아온다
  const setTab = useScrollMemory(tab, setTabState)

  const openInManual = useCallback(
    (build: BuildState, sourceId: string | null = null) => {
      setManualBuild(build)
      setManualSourceId(sourceId)
      setTab('manual', { top: true })
    },
    [setManualBuild, setManualSourceId, setTab],
  )

  const value = useMemo(
    () => ({
      db,
      customTalismans,
      setCustomTalismans,
      manualBuild,
      setManualBuild,
      savedBuilds,
      setSavedBuilds,
      manualSourceId,
      setManualSourceId,
      tab,
      setTab,
      openInManual,
    }),
    [
      db,
      customTalismans,
      setCustomTalismans,
      manualBuild,
      setManualBuild,
      savedBuilds,
      setSavedBuilds,
      manualSourceId,
      setManualSourceId,
      tab,
      setTab,
      openInManual,
    ],
  )
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
