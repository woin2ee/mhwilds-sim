import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import type { SavedBuild } from '../core/savedBuilds'
import type { BuildState, CustomTalisman } from '../core/types'
import type { GameDb } from '../data/db'

export type TabId = 'manual' | 'search' | 'saved' | 'talismans' | 'backup'

export interface AppStateValue {
  db: GameDb
  /** 사용자가 등록한 호석 (감정 호석 등) */
  customTalismans: CustomTalisman[]
  setCustomTalismans: Dispatch<SetStateAction<CustomTalisman[]>>
  /** 수동 세팅 탭의 현재 빌드 */
  manualBuild: BuildState
  setManualBuild: Dispatch<SetStateAction<BuildState>>
  /** 내 세팅 (브라우저 저장) */
  savedBuilds: SavedBuild[]
  setSavedBuilds: Dispatch<SetStateAction<SavedBuild[]>>
  /** 수동 세팅에 불러온 내 세팅 id (덮어쓰기 저장용). 직접 만들었거나 검색 결과에서 왔으면 null */
  manualSourceId: string | null
  setManualSourceId: (id: string | null) => void
  tab: TabId
  /** 탭 이동. 탭마다 스크롤 위치를 기억해 돌아가고, 지금 탭을 다시 고르면 맨 위로 올라간다. */
  setTab: (tab: TabId) => void
  /** 빌드를 수동 세팅 탭에서 연다. 내 세팅에서 불러온 경우 sourceId 를 넘긴다. */
  openInManual: (build: BuildState, sourceId?: string | null) => void
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
