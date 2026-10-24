// 검색 조건 저장: 무기를 바꾸면 크게 바뀌는 검색 조건을 이름을 붙여 저장해 두고 불러온다 (DESIGN.md §7.2)
import { NAME_MAX } from '../../core/savedBuilds'
import { nameOf, type GameDb } from '../../data/db'
import { WEAPON_KIND_LABEL } from '../../data/labels'
import { newId } from '../../lib/id'
import { isStoredConditions, normalizeConditions, sortRequired, type SearchConditions } from './conditions'

/** 저장하는 조건. 정렬은 결과를 보는 방식이라 담지 않고, 불러올 때 지금 정렬을 그대로 둔다 */
export type PresetConditions = Omit<SearchConditions, 'sort'>

export interface SearchPreset {
  id: string
  name: string
  conditions: PresetConditions
  /** ISO 시각 */
  updatedAt: string
}

/** 저장값에서 형식이 맞는 것만 (하나가 깨져도 나머지는 살린다) */
export function validPresets(value: unknown): SearchPreset[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (p): p is SearchPreset =>
      typeof p === 'object' &&
      p !== null &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      isStoredConditions(p.conditions),
  )
}

export function withoutSort(cond: SearchConditions): PresetConditions {
  const copy: Partial<SearchConditions> = { ...cond }
  delete copy.sort
  return copy as PresetConditions
}

const trimName = (name: string) => name.trim().slice(0, NAME_MAX)

export function newPreset(name: string, cond: SearchConditions): SearchPreset {
  return {
    id: newId(),
    name: trimName(name) || '이름 없는 조건',
    conditions: withoutSort(cond),
    updatedAt: new Date().toISOString(),
  }
}

/** 지금 조건으로 덮어쓴다. 이름을 비우면 원래 이름 */
export function overwritePreset(preset: SearchPreset, cond: SearchConditions, name = preset.name): SearchPreset {
  return {
    ...preset,
    name: trimName(name) || preset.name,
    conditions: withoutSort(cond),
    updatedAt: new Date().toISOString(),
  }
}

/** 불러올 조건. 저장한 뒤 생긴 필드는 기본값으로 채우고(normalizeConditions), 정렬은 지금 것을 둔다 */
export function presetConditions(preset: SearchPreset, current: SearchConditions): SearchConditions {
  return { ...normalizeConditions(preset.conditions), sort: current.sort }
}

/**
 * 같은 조건인지 가리는 키. 정렬은 빼고, 원하는 스킬의 off·locked 는 없으면 false 로 맞춘다
 * (켰다 끈 스킬은 off: false 로 남아 저장값 모양이 달라도 같은 조건이다)
 */
export function conditionsKey(cond: Partial<SearchConditions>): string {
  const c = withoutSort(normalizeConditions(cond))
  return JSON.stringify({
    ...c,
    required: c.required.map((r) => ({ skillId: r.skillId, level: r.level, off: !!r.off, locked: !!r.locked })),
  })
}

/** 켜 둔 원하는 스킬 (목록 순서). 예: "약점 특효5 · 도전자5" */
function skillsText(db: GameDb, cond: SearchConditions, max: number): { text: string; rest: number } {
  const on = sortRequired(db, cond.required).filter((r) => !r.off && db.skills.has(r.skillId))
  const text = on
    .slice(0, max)
    .map((r) => `${nameOf(db.skill(r.skillId).name)}${r.level}`)
    .join(' · ')
  return { text, rest: Math.max(0, on.length - max) }
}

/** 무기 표시. short 면 무기 종류만 (이름의 앞부분), 아니면 무기 이름 */
function weaponText(db: GameDb, cond: SearchConditions, short: boolean): string {
  if (cond.weaponMode === 'custom') return '슬롯 직접 지정'
  const weapon = cond.weaponMode === 'db' && cond.weaponId !== null ? db.weapons.get(cond.weaponId) : undefined
  if (!weapon) return ''
  return short ? WEAPON_KIND_LABEL[weapon.kind] : nameOf(weapon.name)
}

/** 기본 이름: 무기 종류 + 앞쪽 원하는 스킬 2개. 예: "대검 · 약점 특효5 · 도전자5" */
export function suggestPresetName(db: GameDb, cond: SearchConditions): string {
  const parts = [weaponText(db, cond, true), skillsText(db, cond, 2).text].filter(Boolean)
  return parts.join(' · ').slice(0, NAME_MAX) || '새 조건'
}

/** 목록에 보일 요약: "망각의 오스트란차 · 약점 특효5 · 도전자5 · 연격5 외 4개" (꺼 둔 스킬은 빼고) */
export function presetSummary(db: GameDb, conditions: PresetConditions): string {
  const cond = normalizeConditions(conditions)
  const { text, rest } = skillsText(db, cond, 3)
  const skills = text ? `${text}${rest > 0 ? ` 외 ${rest}개` : ''}` : '원하는 스킬 없음'
  return [weaponText(db, cond, false) || '무기 미지정', skills].join(' · ')
}
