// 사전 찾기: 스킬과 방어구를 한 검색 칸에서 함께 찾는다. 화면과 상관없는 순수 함수 (DESIGN.md §7.4)
import { nameOf, type GameDb } from '../../data/db'
import { normalize } from '../../lib/text'
import { armorSetEntries, searchArmor, type ArmorMatch, type ArmorSetEntry } from './armorLookup'
import { buildSkillSearchIndex, searchSkills, type SkillMatch, type SkillSearchIndex } from './skillLookup'

/** 사전에서 보는 항목. 방어구는 세트로 보고, 방어구 하나로 찾았으면 그 방어구를 강조한다 */
export type DictionaryEntry = { kind: 'skill'; id: number } | { kind: 'armor'; id: number; pieceId?: number }

export function isDictionaryEntry(value: unknown): value is DictionaryEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (!Number.isInteger(v.id)) return false
  if (v.kind === 'skill') return true
  return v.kind === 'armor' && (v.pieceId === undefined || Number.isInteger(v.pieceId))
}

export function sameEntry(a: DictionaryEntry | null, b: DictionaryEntry | null): boolean {
  return a !== null && b !== null && a.kind === b.kind && a.id === b.id
}

/** 항목 이름 (데이터에 없으면 null) */
export function entryName(db: GameDb, entry: DictionaryEntry): string | null {
  const item = entry.kind === 'skill' ? db.skills.get(entry.id) : db.armorSets.get(entry.id)
  return item ? nameOf(item.name) : null
}

export type DictionaryFilter = 'all' | 'skill' | 'armor'

export type DictionaryItem = ({ type: 'skill' } & SkillMatch) | ({ type: 'armor' } & ArmorMatch)

export interface DictionaryIndex {
  skills: SkillSearchIndex
  armor: ArmorSetEntry[]
}

export function buildDictionaryIndex(db: GameDb): DictionaryIndex {
  return { skills: buildSkillSearchIndex(db), armor: armorSetEntries(db) }
}

/**
 * 검색어가 있으면 스킬 이름(단계 이름 포함) → 방어구 → 장식주 이름으로 찾은 스킬 → 효과 글로 찾은 스킬 순서
 * (이름이 맞는 것을 먼저). 검색어가 없으면 스킬(종류 → 이름) → 방어구 세트(레어도 → 이름).
 */
export function searchDictionary(index: DictionaryIndex, query: string, filter: DictionaryFilter): DictionaryItem[] {
  const skills =
    filter === 'armor' ? [] : searchSkills(index.skills, query).map((m): DictionaryItem => ({ type: 'skill', ...m }))
  const armor: DictionaryItem[] =
    filter === 'skill'
      ? []
      : normalize(query)
        ? searchArmor(index.armor, query).map((m) => ({ type: 'armor', ...m }))
        : index.armor.map((entry) => ({ type: 'armor', entry, score: 0 }))
  const byName = skills.filter((m) => m.type === 'skill' && (m.via === 'name' || m.via === 'rank'))
  return [...byName, ...armor, ...skills.slice(byName.length)]
}
