import type { GameDb } from '../data/db'
import { ELEMENTS, type Element, type Skill, type SkillPoint } from '../data/types'
import { canPlace, resolveEquipment, type ResolvedEquipment } from './equipment'
import { EQUIP_KEYS, type BuildState, type CustomTalisman, type EquipKey, type Slot } from './types'

export interface SkillContribution {
  from: EquipKey
  /** 장식주로 얻은 경우 장식주 id, 장비 자체 스킬이면 null */
  decorationId: number | null
  level: number
}

export interface SkillTotal {
  skillId: number
  /** 최대 레벨을 적용한 실제 발동 레벨 */
  level: number
  /** 최대 레벨 적용 전 합계 (초과분 표시용) */
  rawLevel: number
  maxLevel: number
  contributions: SkillContribution[]
}

export interface BonusTotal {
  skillId: number
  kind: 'set' | 'group'
  pieces: number
  /** 발동 중인 단계 (0 = 미발동) */
  level: number
  maxLevel: number
  /** 다음 단계에 필요한 부위 수 (없으면 null) */
  nextPieces: number | null
}

export interface SlotUsage {
  key: EquipKey
  index: number
  slot: Slot
  decorationId: number | null
  /** 장식주 종류/크기가 슬롯에 맞지 않으면 false (스킬 계산에서 제외) */
  valid: boolean
}

export interface BuildSummary {
  equipment: Partial<Record<EquipKey, ResolvedEquipment>>
  /** armor/weapon 스킬 합계 (레벨 내림차순) */
  skills: SkillTotal[]
  /** 1부위 이상 장착한 시리즈/그룹 스킬 */
  bonuses: BonusTotal[]
  defense: { base: number; max: number }
  resistances: Record<Element, number>
  slots: SlotUsage[]
  /** 장식주가 비어 있는 슬롯 */
  freeSlots: Slot[]
}

/** 부위 수에 따른 시리즈/그룹 스킬 발동 단계 */
export function bonusLevel(skill: Skill, pieces: number): number {
  let level = 0
  for (const rank of skill.ranks) {
    if (rank.pieces !== undefined && rank.pieces <= pieces) level = Math.max(level, rank.level)
  }
  return level
}

function nextBonusPieces(skill: Skill, pieces: number): number | null {
  const next = skill.ranks
    .map((rank) => rank.pieces ?? 0)
    .filter((p) => p > pieces)
    .sort((a, b) => a - b)[0]
  return next ?? null
}

export function computeBuild(
  db: GameDb,
  build: BuildState,
  customTalismans: readonly CustomTalisman[] = [],
): BuildSummary {
  const equipment = resolveEquipment(db, build, customTalismans)
  const totals = new Map<number, SkillTotal>()
  const addSkill = (point: SkillPoint, from: EquipKey, decorationId: number | null) => {
    const skill = db.skills.get(point.skillId)
    if (!skill) return
    let total = totals.get(point.skillId)
    if (!total) {
      total = { skillId: point.skillId, level: 0, rawLevel: 0, maxLevel: skill.maxLevel, contributions: [] }
      totals.set(point.skillId, total)
    }
    total.rawLevel += point.level
    total.contributions.push({ from, decorationId, level: point.level })
  }

  const defense = { base: 0, max: 0 }
  const resistances = Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>
  const setPieces = new Map<number, number>()
  const groupPieces = new Map<number, number>()
  const slots: SlotUsage[] = []

  for (const key of EQUIP_KEYS) {
    const eq = equipment[key]
    if (!eq) continue
    defense.base += eq.defense.base
    defense.max += eq.defense.max
    for (const element of ELEMENTS) resistances[element] += eq.resistances[element]
    for (const point of eq.skills) addSkill(point, key, null)
    if (eq.setSkillId !== null) setPieces.set(eq.setSkillId, (setPieces.get(eq.setSkillId) ?? 0) + 1)
    if (eq.groupSkillId !== null) groupPieces.set(eq.groupSkillId, (groupPieces.get(eq.groupSkillId) ?? 0) + 1)

    const decorationIds = build.decorations[key] ?? []
    eq.slots.forEach((slot, index) => {
      const decoration = db.decorations.get(decorationIds[index] ?? -1)
      const valid = !decoration || canPlace(decoration, slot)
      slots.push({ key, index, slot, decorationId: decoration?.id ?? null, valid })
      if (decoration && valid) for (const point of decoration.skills) addSkill(point, key, decoration.id)
    })
  }

  const skills = [...totals.values()]
    .map((t) => ({ ...t, level: Math.min(t.rawLevel, t.maxLevel) }))
    .sort((a, b) => b.level - a.level || a.skillId - b.skillId)

  const bonuses: BonusTotal[] = []
  for (const [kind, counts] of [
    ['set', setPieces],
    ['group', groupPieces],
  ] as const) {
    for (const [skillId, pieces] of counts) {
      const skill = db.skills.get(skillId)
      if (!skill) continue
      bonuses.push({
        skillId,
        kind,
        pieces,
        level: bonusLevel(skill, pieces),
        maxLevel: skill.maxLevel,
        nextPieces: nextBonusPieces(skill, pieces),
      })
    }
  }
  bonuses.sort((a, b) => b.level - a.level || b.pieces - a.pieces || a.skillId - b.skillId)

  return {
    equipment,
    skills,
    bonuses,
    defense,
    resistances,
    slots,
    freeSlots: slots.filter((s) => s.decorationId === null).map((s) => s.slot),
  }
}

/** 발동 중인 스킬 레벨 (armor/weapon 스킬 + 시리즈/그룹 스킬) */
export function activeSkillLevels(summary: BuildSummary): Map<number, number> {
  const levels = new Map<number, number>()
  for (const s of summary.skills) if (s.level > 0) levels.set(s.skillId, s.level)
  for (const b of summary.bonuses) if (b.level > 0) levels.set(b.skillId, b.level)
  return levels
}

/** 요구 레벨에 못 미친 스킬 목록 */
export function missingRequirements(
  summary: BuildSummary,
  required: readonly SkillPoint[],
): { skillId: number; required: number; current: number }[] {
  const levels = activeSkillLevels(summary)
  return required
    .map((r) => ({ skillId: r.skillId, required: r.level, current: levels.get(r.skillId) ?? 0 }))
    .filter((r) => r.current < r.required)
}

/**
 * 조합에 들어간 비선호 스킬. 사용자가 직접 고른 무기 자체 스킬은 제외하고,
 * 방어구·호석·장식주(무기 슬롯 장식주 포함)로 얻은 것만 센다.
 */
export function unwantedSkillsOf(summary: BuildSummary, excluded: readonly number[]): number[] {
  const excludedSet = new Set(excluded)
  return summary.skills
    .filter(
      (s) =>
        excludedSet.has(s.skillId) &&
        s.contributions.some((c) => !(c.from === 'weapon' && c.decorationId === null)),
    )
    .map((s) => s.skillId)
}
