// 검색 조건 저장: 무기를 바꾸면 크게 바뀌는 검색 조건을 이름을 붙여 저장해 두고 불러온다 (DESIGN.md §7.2)
import { isWeaponKind, NAME_MAX, weaponKindField } from '../../core/savedBuilds'
import { nameOf, type GameDb } from '../../data/db'
import { WEAPON_KIND_LABEL } from '../../data/labels'
import type { WeaponKind } from '../../data/types'
import { newId } from '../../lib/id'
import { isStoredConditions, normalizeConditions, sortRequired, type SearchConditions } from './conditions'

/**
 * 저장하는 조건. 정렬은 결과를 보는 방식이고 제외할 방어구는 무기와 상관없이 가진 장비에 따라 정하는 것이라 담지 않고,
 * 불러올 때 지금 값을 그대로 둔다
 */
export type PresetConditions = Omit<SearchConditions, 'sort' | 'excludedArmor'>

export interface SearchPreset {
  id: string
  name: string
  conditions: PresetConditions
  /**
   * 무기 종류 (목록에 보이고 종류별로 거른다). 조건에 고른 무기가 있으면 그 무기의 종류가 먼저다 (presetWeaponKind).
   * 슬롯 직접 지정·무기 미지정으로 찾는 조건은 저장·정보 수정 창에서 고른 종류이고, 무기를 고른 조건은 저장할 때마다 그 무기의
   * 종류를 담아 둬서 나중에 무기를 빼도 그 종류가 남는다. 없으면 미지정
   */
  weaponKind?: WeaponKind
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

/** 조건에서 저장할 부분 (정렬·제외할 방어구를 뺀다) */
export function presetPart(cond: SearchConditions): PresetConditions {
  const copy: Partial<SearchConditions> = { ...cond }
  delete copy.sort
  delete copy.excludedArmor
  return copy as PresetConditions
}

const trimName = (name: string) => name.trim().slice(0, NAME_MAX)

/** 조건에서 고른 무기의 종류 (무기 선택에서 무기까지 골랐을 때). 슬롯 직접 지정·무기 미지정·아직 무기를 안 고름은 null */
export function conditionsWeaponKind(cond: Partial<SearchConditions>): WeaponKind | null {
  return cond.weaponMode === 'db' && Number.isInteger(cond.weaponId) && isWeaponKind(cond.weaponKind)
    ? cond.weaponKind
    : null
}

/** 저장한 조건의 무기 종류: 조건에서 고른 무기의 종류, 없으면 고른(담아 둔) 종류. 둘 다 없으면 null (미지정) */
export function presetWeaponKind(preset: Pick<SearchPreset, 'conditions' | 'weaponKind'>): WeaponKind | null {
  return conditionsWeaponKind(preset.conditions) ?? (isWeaponKind(preset.weaponKind) ? preset.weaponKind : null)
}

/** 무기 종류를 kind 로 바꾼 조건 (null 이면 키를 뺀다) */
function withWeaponKind(preset: SearchPreset, kind: WeaponKind | null): SearchPreset {
  const next = { ...preset }
  delete next.weaponKind
  return { ...next, ...weaponKindField(kind) }
}

/** weaponKind: 조건에서 무기를 고르지 않았을 때의 종류 (저장 창에서 고른 것) */
export function newPreset(name: string, cond: SearchConditions, weaponKind: WeaponKind | null = null): SearchPreset {
  return {
    id: newId(),
    name: trimName(name) || '이름 없는 조건',
    conditions: presetPart(cond),
    ...weaponKindField(conditionsWeaponKind(cond) ?? weaponKind),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * 지금 조건으로 덮어쓴다. 이름을 비우면 원래 이름. 무기 종류는 조건에서 고른 무기가 있으면 그 종류로 바꾸고, 없으면 원래 종류를
 * 둔다 (무기를 고른 조건에서 무기를 빼도 그 무기의 종류가 남아 목록의 다른 종류로 옮겨 가지 않는다)
 */
export function overwritePreset(preset: SearchPreset, cond: SearchConditions, name = preset.name): SearchPreset {
  const next = {
    ...preset,
    name: trimName(name) || preset.name,
    conditions: presetPart(cond),
    updatedAt: new Date().toISOString(),
  }
  return withWeaponKind(next, conditionsWeaponKind(cond) ?? presetWeaponKind(preset))
}

/**
 * 정보 수정: 이름(비우면 원래 이름)과 무기 종류. 조건에서 고른 무기가 있으면 종류는 그 무기의 종류라 weaponKind 는 쓰지 않는다.
 * 바뀐 것이 없으면 받은 조건을 그대로 돌려준다 (고친 시각도 그대로)
 */
export function editPresetInfo(preset: SearchPreset, name: string, weaponKind: WeaponKind | null): SearchPreset {
  const nextName = trimName(name) || preset.name
  const kind = conditionsWeaponKind(preset.conditions) ?? weaponKind
  if (nextName === preset.name && kind === presetWeaponKind(preset)) return preset
  return withWeaponKind({ ...preset, name: nextName, updatedAt: new Date().toISOString() }, kind)
}

/**
 * 사용 중인 저장한 조건(id)에 지금 조건을 저장한다 (고칠 때마다 자동 저장). 이미 같은 조건이거나 그 조건이 없으면
 * 받은 목록을 그대로 돌려줘서 저장값이 바뀌지 않는다
 */
export function saveToPreset(stored: SearchPreset[], id: string, cond: SearchConditions): SearchPreset[] {
  const presets = validPresets(stored)
  const target = presets.find((p) => p.id === id)
  if (!target || conditionsKey(target.conditions) === conditionsKey(cond)) return stored
  return presets.map((p) => (p === target ? overwritePreset(p, cond) : p))
}

/** 불러올 조건. 저장한 뒤 생긴 필드는 기본값으로 채우고(normalizeConditions), 정렬·제외할 방어구는 지금 것을 둔다 */
export function presetConditions(preset: SearchPreset, current: SearchConditions): SearchConditions {
  return { ...normalizeConditions(preset.conditions), sort: current.sort, excludedArmor: current.excludedArmor }
}

/**
 * 같은 조건인지 가리는 키. 저장하지 않는 정렬·제외할 방어구는 빼고, 원하는 스킬의 off·locked 는 없으면 false 로 맞춘다
 * (켰다 끈 스킬은 off: false 로 남아 저장값 모양이 달라도 같은 조건이다)
 */
export function conditionsKey(cond: Partial<SearchConditions>): string {
  const c = presetPart(normalizeConditions(cond))
  return JSON.stringify({
    ...c,
    required: c.required.map((r) => ({ skillId: r.skillId, level: r.level, off: !!r.off, locked: !!r.locked })),
  })
}

/** 켜 둔 원하는 스킬 (목록 순서). 예: "약점 특효5 · 도전자5" */
export function skillsText(db: GameDb, cond: SearchConditions, max: number): { text: string; rest: number } {
  const on = sortRequired(db, cond.required).filter((r) => !r.off && db.skills.has(r.skillId))
  const text = on
    .slice(0, max)
    .map((r) => `${nameOf(db.skill(r.skillId).name)}${r.level}`)
    .join(' · ')
  return { text, rest: Math.max(0, on.length - max) }
}

/** 무기 표시. short 면 무기 종류만 (이름의 앞부분), 아니면 무기 이름 (미지정이면 빈 문자열) */
export function weaponText(db: GameDb, cond: SearchConditions, short: boolean): string {
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
