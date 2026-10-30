// 기기끼리 동기화하는 저장값의 localStorage 키와 형식 검사 (DESIGN.md §8.5).
// 키 앞머리('mhwilds-sim:')는 lib/storage 가 붙인다. 저장 형식을 바꾸면 키 버전(:v1 → :v2)을 올린다.
import type { SavedBuild } from '../core/savedBuilds'
import type { BuildState, CustomTalisman } from '../core/types'

export const STORAGE_KEYS = {
  /** 내 호석 */
  talismans: 'talismans:v1',
  /** 내 세팅 */
  savedBuilds: 'saved-builds:v1',
  /** 수동 세팅의 지금 빌드와 불러온 내 세팅 id */
  manualBuild: 'manual-build:v1',
  manualSource: 'manual-source:v1',
  /** 스킬 검색의 지금 조건, 저장한 조건, 사용 중인 저장한 조건 id */
  searchConditions: 'search-conditions:v1',
  searchPresets: 'search-presets:v1',
  searchPresetActive: 'search-preset-active:v1',
} as const

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export function isBuildState(v: unknown): v is BuildState {
  return isObject(v) && isObject(v.armor) && isObject(v.decorations)
}

export const isTalisman = (t: unknown): t is CustomTalisman =>
  isObject(t) && typeof t.id === 'string' && Array.isArray(t.skills)

export const isSavedBuild = (s: unknown): s is SavedBuild => isObject(s) && typeof s.id === 'string' && isBuildState(s.build)

export const isTalismanList = (v: unknown): v is CustomTalisman[] => Array.isArray(v) && v.every(isTalisman)

export const isSavedBuildList = (v: unknown): v is SavedBuild[] => Array.isArray(v) && v.every(isSavedBuild)

export const isNullableString = (v: unknown): v is string | null => v === null || typeof v === 'string'
