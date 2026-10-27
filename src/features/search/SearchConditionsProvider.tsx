import { useCallback, useMemo, type ReactNode } from 'react'
import { usePersistentState } from '../../lib/storage'
import { DEFAULT_CONDITIONS, isStoredConditions, normalizeConditions, type SearchConditions } from './conditions'
import { SearchConditionsContext, type SearchConditionsValue } from './conditionsContext'

/** 스킬 검색 조건을 들고 있다. 스킬 검색 화면과 스킬 사전(원하는 스킬에 추가)이 함께 쓴다 */
export function SearchConditionsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = usePersistentState<Partial<SearchConditions>>(
    'search-conditions:v1',
    DEFAULT_CONDITIONS,
    isStoredConditions,
  )
  const cond = useMemo(() => normalizeConditions(stored), [stored])
  const update = useCallback<SearchConditionsValue['update']>(
    (change) =>
      setStored((prev) => {
        const current = normalizeConditions(prev)
        return { ...current, ...change(current) }
      }),
    [setStored],
  )
  const patch = useCallback<SearchConditionsValue['patch']>((change) => update(() => change), [update])
  const value = useMemo(() => ({ cond, patch, update, replace: setStored }), [cond, patch, update, setStored])
  return <SearchConditionsContext.Provider value={value}>{children}</SearchConditionsContext.Provider>
}
