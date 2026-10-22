import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import type { BuildState, CustomTalisman } from '../core/types'
import type { GameDb } from '../data/db'

export type TabId = 'manual' | 'search' | 'talismans'

export interface AppStateValue {
  db: GameDb
  /** 사용자가 등록한 호석 (감정 호석 등) */
  customTalismans: CustomTalisman[]
  setCustomTalismans: Dispatch<SetStateAction<CustomTalisman[]>>
  /** 수동 세팅 탭의 현재 빌드 */
  manualBuild: BuildState
  setManualBuild: Dispatch<SetStateAction<BuildState>>
  tab: TabId
  setTab: (tab: TabId) => void
  /** 빌드를 수동 세팅 탭에서 연다 (검색 결과 → 수동 세팅) */
  openInManual: (build: BuildState) => void
}

export const AppStateContext = createContext<AppStateValue | null>(null)

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext)
  if (!value) throw new Error('useAppState must be used inside AppStateProvider')
  return value
}

export function useDb(): GameDb {
  return useAppState().db
}
