import { createContext, useContext } from 'react'
import type { SearchConditions } from './conditions'

/** 스킬 검색 조건 (localStorage search-conditions:v1). 스킬 사전 탭에서도 원하는 스킬을 넣어서 앱 전체가 함께 쓴다 */
export interface SearchConditionsValue {
  /** 저장값에 빠진 필드를 기본값으로 채운 지금 조건 */
  cond: SearchConditions
  patch: (change: Partial<SearchConditions>) => void
  /** 바꿀 값을 바로 전 조건으로 계산한다 (알림의 되돌리기처럼 화면이 그린 조건이 낡았을 수 있을 때) */
  update: (change: (cond: SearchConditions) => Partial<SearchConditions>) => void
  /** 조건 전체를 바꾼다 (저장한 조건 불러오기) */
  replace: (cond: SearchConditions) => void
}

export const SearchConditionsContext = createContext<SearchConditionsValue | null>(null)

export function useSearchConditions(): SearchConditionsValue {
  const value = useContext(SearchConditionsContext)
  if (!value) throw new Error('useSearchConditions must be used inside SearchConditionsProvider')
  return value
}
