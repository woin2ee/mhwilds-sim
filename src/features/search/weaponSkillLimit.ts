// 원하는 무기 스킬은 함께 띄울 수 있는 만큼만 켠다 (DESIGN.md §7.2). 판정은 core/search/weaponFit.ts
import { resolveTalisman, resolveWeapon } from '../../core/equipment'
import { WeaponSkillFit, type WeaponSkillSource } from '../../core/search/weaponFit'
import type { CustomTalisman } from '../../core/types'
import type { GameDb } from '../../data/db'
import type { Skill } from '../../data/types'
import { addRequiredSkill, talismanRefsOf, weaponChoiceOf, type RequiredSkill, type SearchConditions } from './conditions'

/** 무기 스킬 줄 하나를 켤 수 있는 레벨 */
export interface WeaponRowLimit {
  /**
   * 켠 다른 무기 스킬과 함께 띄울 수 있는 가장 높은 레벨 (0 = 어떤 레벨로도 못 띄움). 끈 줄은 레벨이 이 이하여야 켤 수 있고,
   * 켠 줄은 레벨을 여기까지만 올릴 수 있다. 켠 무기 스킬을 이미 모두 띄울 수 없으면 켠 줄은 지금 레벨 (낮추기·끄기는 늘 된다)
   */
  max: number
  /** 켠 다른 무기 스킬이 없을 때 띄울 수 있는 가장 높은 레벨 (max 보다 크면 다른 스킬 때문에 막힌 것) */
  aloneMax: number
}

export interface WeaponSkillLimit {
  /** 지금 켠 무기 스킬을 모두 띄울 수 있는지 */
  fits: boolean
  /** 무기를 정하지 않아 모든 무기로 따졌는지 */
  anyWeapon: boolean
  /** 원하는 스킬 목록의 무기 스킬 id → 켤 수 있는 레벨 */
  rows: ReadonlyMap<number, WeaponRowLimit>
}

type RequiredList = Pick<SearchConditions, 'required' | 'requiredDividers'>

const weaponRowsOf = (db: GameDb, required: readonly RequiredSkill[]) =>
  required.filter((r) => db.skills.get(r.skillId)?.kind === 'weapon')

/** 켠 레벨 (끈 줄은 0) */
const onLevels = (rows: readonly RequiredSkill[]) => rows.map((r) => (r.off ? 0 : r.level))

/**
 * 조건의 무기·호석·장식주 옵션으로 rows 의 무기 스킬 판정기를 만든다. 무기를 정하지 않았으면(미지정·무기를 아직 안 고름)
 * 무기 종류와 상관없이 모든 무기로 따져서, 어떤 무기로도 함께 못 띄우는 조합만 막는다
 */
function weaponFitOf(
  db: GameDb,
  cond: SearchConditions,
  customTalismans: readonly CustomTalisman[],
  rows: readonly RequiredSkill[],
) {
  const weapon = resolveWeapon(db, weaponChoiceOf(db, cond))
  const weapons: WeaponSkillSource[] = weapon
    ? [{ skills: weapon.skills, weaponSlots: weapon.slots.map((s) => s.level) }]
    : db.data.weapons.map((w) => ({ skills: w.skills, weaponSlots: w.slots }))
  const talismans = talismanRefsOf(db, cond, customTalismans).flatMap((ref): WeaponSkillSource[] => {
    const talisman = resolveTalisman(db, ref, customTalismans)
    if (!talisman) return []
    const weaponSlots = talisman.slots.filter((s) => s.kind === 'weapon').map((s) => s.level)
    return [{ skills: talisman.skills, weaponSlots }]
  })
  const fit = new WeaponSkillFit(db, {
    skillIds: rows.map((r) => r.skillId),
    weapons,
    talismans,
    useDecorations: cond.useDecorations,
    excludedSkills: cond.excluded,
    excludeMode: cond.excludeMode,
    spare: cond.spareSlots.weapon,
  })
  return { fit, anyWeapon: weapon === null }
}

export function weaponSkillLimit(
  db: GameDb,
  cond: SearchConditions,
  customTalismans: readonly CustomTalisman[],
): WeaponSkillLimit {
  const rows = weaponRowsOf(db, cond.required)
  if (rows.length === 0) {
    return { fits: true, anyWeapon: resolveWeapon(db, weaponChoiceOf(db, cond)) === null, rows: new Map() }
  }
  const { fit, anyWeapon } = weaponFitOf(db, cond, customTalismans, rows)
  const on = onLevels(rows)
  const fits = fit.fits(on)
  const limits = new Map<number, WeaponRowLimit>()
  rows.forEach((r, i) => {
    const maxLevel = db.skill(r.skillId).maxLevel
    /** 이 줄만 level 로 바꾼 레벨들 (others = false 면 다른 줄은 모두 끈다) */
    const fitsAt = (level: number, others = true) =>
      fit.fits(on.map((l, j) => (j === i ? level : others ? l : 0)))
    // 레벨이 높을수록 채우기 어려우므로 가능한 레벨은 1 부터 이어진다
    const highest = (from: number, others: boolean) => {
      let level = from
      while (level > 0 && !fitsAt(level, others)) level--
      return level
    }
    const max = r.off || fits ? highest(maxLevel, true) : r.level
    const aloneMax = max >= maxLevel ? max : highest(maxLevel, false)
    limits.set(r.skillId, { max, aloneMax })
  })
  return { fits, anyWeapon, rows: limits }
}

/**
 * 무기 스킬 줄의 레벨 상한 안내: 끈 줄을 못 켤 때, 켠 줄의 레벨을 더 못 올릴 때.
 * 예) '켠 다른 무기 스킬과 함께는 Lv2까지만 띄울 수 있어요', '지금 무기·호석으로는 띄울 수 없어요'
 */
export function weaponRowLimitText(limit: WeaponSkillLimit, row: WeaponRowLimit): string {
  const byOthers = row.max < row.aloneMax
  if (row.max > 0) {
    const where = byOthers ? '켠 다른 무기 스킬과 함께는' : limit.anyWeapon ? '무기와 상관없이' : '지금 무기·호석으로는'
    return `${where} Lv${row.max}까지만 띄울 수 있어요`
  }
  const where = byOthers ? '켠 다른 무기 스킬과 함께' : limit.anyWeapon ? '어떤 무기로도' : '지금 무기·호석으로는'
  return `${where} 띄울 수 없어요`
}

/** 켠 무기 스킬을 이미 모두 띄울 수 없을 때 (무기를 바꿨거나 예전에 저장한 조건) 안내 */
export function weaponLimitWarning(limit: WeaponSkillLimit): string {
  return limit.anyWeapon
    ? '켠 무기 스킬은 어떤 무기로도 모두 띄울 수 없어요. 끄거나 레벨을 낮추세요.'
    : '켠 무기 스킬을 지금 무기·호석으로는 모두 띄울 수 없어요. 끄거나 레벨을 낮추세요.'
}

/**
 * 원하는 스킬에 넣는다 (addRequiredSkill: 최대 레벨, 그 묶음 끝). 무기 스킬인데 켠 무기 스킬과 함께 띄울 수 없으면 꺼 둔 채로 넣고
 * blocked 에 그 까닭을 담는다
 */
export function addWithinWeaponLimit(
  db: GameDb,
  cond: SearchConditions,
  customTalismans: readonly CustomTalisman[],
  skill: Skill,
): { list: RequiredList; blocked: string | null } {
  const list = addRequiredSkill(db, { required: cond.required, requiredDividers: cond.requiredDividers }, skill)
  if (skill.kind !== 'weapon' || list.required === cond.required) return { list, blocked: null }
  // 꺼 둔 채로 넣어 보고 그 레벨로 켤 수 있으면 켜서 넣는다
  const required = list.required.map((r) => (r.skillId === skill.id ? { ...r, off: true } : r))
  const limit = weaponSkillLimit(db, { ...cond, ...list, required }, customTalismans)
  const row = limit.rows.get(skill.id)
  const level = list.required.find((r) => r.skillId === skill.id)?.level ?? 0
  if (!row || level <= row.max) return { list, blocked: null }
  return { list: { ...list, required }, blocked: weaponRowLimitText(limit, row) }
}
