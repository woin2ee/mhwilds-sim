import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { usePersistentState } from '../../lib/storage'
import { isNullableString, STORAGE_KEYS } from '../../state/storedValues'
import { DEFAULT_CONDITIONS, isStoredConditions, normalizeConditions, type SearchConditions } from './conditions'
import {
  SearchConditionsContext,
  SearchPresetsContext,
  type SearchConditionsValue,
  type SearchPresetsValue,
} from './conditionsContext'
import { saveToPreset, validPresets, type SearchPreset } from './presets'

// 항목 하나가 깨져도 목록 전체를 버리지 않게 배열인지만 보고, 항목은 validPresets 로 거른다
const isArray = (value: unknown): value is SearchPreset[] => Array.isArray(value)

/**
 * 세팅 검색 조건과 저장한 조건을 들고 있다. 세팅 검색 화면과 사전(원하는 스킬에 추가)이 함께 쓴다.
 * 고친 조건은 사용 중인 저장한 조건에 바로 저장한다 (DESIGN.md §7.2)
 */
export function SearchConditionsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = usePersistentState<Partial<SearchConditions>>(
    STORAGE_KEYS.searchConditions,
    DEFAULT_CONDITIONS,
    isStoredConditions,
  )
  const [storedPresets, setPresets] = usePersistentState<SearchPreset[]>(STORAGE_KEYS.searchPresets, [], isArray)
  const [activeId, setActiveId] = usePersistentState<string | null>(
    STORAGE_KEYS.searchPresetActive,
    null,
    isNullableString,
  )
  const cond = useMemo(() => normalizeConditions(stored), [stored])
  const presets = useMemo(() => validPresets(storedPresets), [storedPresets])
  const active = useMemo(() => presets.find((p) => p.id === activeId) ?? null, [presets, activeId])

  // 이 기기에서 고친 조건(update·patch)만 사용 중인 저장한 조건에 저장한다. 동기화·다른 탭에서 받은 조건까지 저장하면
  // 조건과 저장한 조건이 따로 도착하는 사이에 다른 기기에서 고친 것을 덮는다. 처음 열 때도 한 번 맞춘다
  // (자동 저장 전 버전에서 불러와 고치고 저장하지 않은 조건)
  const edited = useRef(true)
  useEffect(() => {
    if (!edited.current) return
    edited.current = false
    if (activeId !== null) setPresets((prev) => saveToPreset(prev, activeId, cond))
  }, [cond, activeId, setPresets])

  const update = useCallback<SearchConditionsValue['update']>(
    (change) => {
      edited.current = true
      setStored((prev) => {
        const current = normalizeConditions(prev)
        return { ...current, ...change(current) }
      })
    },
    [setStored],
  )
  const patch = useCallback<SearchConditionsValue['patch']>((change) => update(() => change), [update])
  const value = useMemo(() => ({ cond, patch, update, replace: setStored }), [cond, patch, update, setStored])
  const presetsValue = useMemo<SearchPresetsValue>(
    () => ({ presets, setPresets, active, setActiveId }),
    [presets, setPresets, active, setActiveId],
  )
  return (
    <SearchConditionsContext.Provider value={value}>
      <SearchPresetsContext.Provider value={presetsValue}>{children}</SearchPresetsContext.Provider>
    </SearchConditionsContext.Provider>
  )
}
