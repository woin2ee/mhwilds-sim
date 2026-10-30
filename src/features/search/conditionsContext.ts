import { createContext, useContext } from 'react'
import type { SearchConditions } from './conditions'
import type { SearchPreset } from './presets'

/** 세팅 검색 조건 (localStorage search-conditions:v1). 사전 탭에서도 원하는 스킬을 넣어서 앱 전체가 함께 쓴다 */
export interface SearchConditionsValue {
  /** 저장값에 빠진 필드를 기본값으로 채운 지금 조건 */
  cond: SearchConditions
  /** 조건을 고친다. 사용 중인 저장한 조건이 있으면 거기에도 바로 저장한다 */
  patch: (change: Partial<SearchConditions>) => void
  /** 바꿀 값을 바로 전 조건으로 계산한다 (알림의 되돌리기처럼 화면이 그린 조건이 낡았을 수 있을 때). 저장은 patch 와 같다 */
  update: (change: (cond: SearchConditions) => Partial<SearchConditions>) => void
  /** 조건 전체를 바꾼다 (저장한 조건 불러오기·되돌리기). 사용 중인 저장한 조건에는 저장하지 않는다 */
  replace: (cond: SearchConditions) => void
}

export const SearchConditionsContext = createContext<SearchConditionsValue | null>(null)

export function useSearchConditions(): SearchConditionsValue {
  const value = useContext(SearchConditionsContext)
  if (!value) throw new Error('useSearchConditions must be used inside SearchConditionsProvider')
  return value
}

/**
 * 저장한 검색 조건 (search-presets:v1)과 사용 중인 것 (search-preset-active:v1). 고친 조건을 사용 중인 조건에 바로
 * 저장하려고 지금 조건과 함께 SearchConditionsProvider 가 들고, 자주 바뀌어서 조건과 컨텍스트를 나눈다
 */
export interface SearchPresetsValue {
  /** 형식이 맞는 것만 */
  presets: SearchPreset[]
  setPresets: (presets: SearchPreset[]) => void
  /** 사용 중인 저장한 조건 (없으면 null) */
  active: SearchPreset | null
  setActiveId: (id: string | null) => void
}

export const SearchPresetsContext = createContext<SearchPresetsValue | null>(null)

export function useSearchPresets(): SearchPresetsValue {
  const value = useContext(SearchPresetsContext)
  if (!value) throw new Error('useSearchPresets must be used inside SearchConditionsProvider')
  return value
}
