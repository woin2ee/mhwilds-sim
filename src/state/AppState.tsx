import { useCallback, useMemo, type ReactNode } from 'react'
import { emptyBuild, type BuildState, type CustomTalisman } from '../core/types'
import type { GameDb } from '../data/db'
import { usePersistentState } from '../lib/storage'
import { AppStateContext, type TabId } from './context'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function isBuildState(v: unknown): v is BuildState {
  return isObject(v) && isObject(v.armor) && isObject(v.decorations)
}

function isTalismanList(v: unknown): v is CustomTalisman[] {
  return Array.isArray(v) && v.every((t) => isObject(t) && typeof t.id === 'string' && Array.isArray(t.skills))
}

function isTab(v: unknown): v is TabId {
  return v === 'manual' || v === 'search' || v === 'talismans'
}

/** 앱 전역 상태. 호석 목록·수동 세팅·현재 탭은 localStorage 에 자동 저장된다. */
export function AppStateProvider({ db, children }: { db: GameDb; children: ReactNode }) {
  const [customTalismans, setCustomTalismans] = usePersistentState<CustomTalisman[]>(
    'talismans:v1',
    [],
    isTalismanList,
  )
  const [manualBuild, setManualBuild] = usePersistentState<BuildState>('manual-build:v1', emptyBuild, isBuildState)
  const [tab, setTab] = usePersistentState<TabId>('tab', 'manual', isTab)

  const openInManual = useCallback(
    (build: BuildState) => {
      setManualBuild(build)
      setTab('manual')
      window.scrollTo({ top: 0 })
    },
    [setManualBuild, setTab],
  )

  const value = useMemo(
    () => ({ db, customTalismans, setCustomTalismans, manualBuild, setManualBuild, tab, setTab, openInManual }),
    [db, customTalismans, setCustomTalismans, manualBuild, setManualBuild, tab, setTab, openInManual],
  )
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
