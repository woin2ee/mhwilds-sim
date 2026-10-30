// 세팅 → 세팅 검색 조건: 내 세팅 카드의 '검색 조건으로', 무기 조건의 '수동 세팅의 무기 가져오기' (DESIGN.md §7.2)
import { activeSkillLevels, computeBuild } from '../../core/calc'
import { gogmaSkillsOf } from '../../core/gogmaArtian'
import type { BuildState, CustomTalisman, WeaponChoice } from '../../core/types'
import type { GameDb } from '../../data/db'
import type { SkillPoint } from '../../data/types'
import { addRequiredSkill, sortRequired, weaponChoiceOf, type SearchConditions } from './conditions'

/** 세팅의 무기 → 무기 조건. 거극 아티어 스킬은 거극 아티어 무기·직접 입력 무기에 붙은 것만. 데이터에 없는 DB 무기면 null */
export function weaponConditionOf(db: GameDb, choice: WeaponChoice): Partial<SearchConditions> | null {
  const gogma = gogmaSkillsOf(db, choice)
  const gogmaPatch = { weaponSetSkillId: gogma.setSkillId, weaponGroupSkillId: gogma.groupSkillId }
  if (choice.type === 'db') {
    const weapon = db.weapons.get(choice.id)
    return weapon ? { weaponMode: 'db', weaponKind: weapon.kind, weaponId: weapon.id, ...gogmaPatch } : null
  }
  return {
    weaponMode: 'custom',
    customWeaponSlots: [0, 1, 2].map((i) => choice.slots[i] ?? 0),
    customWeaponSkills: choice.skills,
    ...gogmaPatch,
  }
}

/** 무기 비교 키 (거극 아티어 스킬은 보지 않는다: 같은 무기에 다른 스킬을 붙인 조건도 그 무기의 조건이다) */
function weaponKey(choice: WeaponChoice): string {
  if (choice.type === 'db') return `db:${choice.id}`
  const slots = [...choice.slots].sort((a, b) => b - a)
  const skills = [...choice.skills].sort((a, b) => a.skillId - b.skillId).map((s) => [s.skillId, s.level])
  return `custom:${JSON.stringify([slots, skills])}`
}

/** 검색 조건이 세팅의 무기로 찾는지 (저장한 조건 고르기에서 '같은 무기'). 둘 중 하나라도 무기가 없으면 false */
export function searchesWithWeapon(db: GameDb, cond: SearchConditions, weapon: WeaponChoice | null): boolean {
  const searched = weaponChoiceOf(db, cond)
  return !!searched && !!weapon && weaponKey(searched) === weaponKey(weapon)
}

/** 세팅의 발동 스킬 (시리즈·그룹 포함, 세팅의 레벨). 원하는 스킬 순서로: 묶음 순, 묶음 안에서는 레벨 높은 순 (카드의 스킬 칩 순서) */
export function buildSkills(db: GameDb, build: BuildState, customTalismans: readonly CustomTalisman[]): SkillPoint[] {
  const levels = activeSkillLevels(computeBuild(db, build, customTalismans))
  return sortRequired(db, [...levels].map(([skillId, level]) => ({ skillId, level })))
}

export interface AddedSkills {
  cond: SearchConditions
  /** 원하는 스킬에 넣은 스킬 (세팅의 레벨) */
  added: SkillPoint[]
  /** 비선호 스킬이라 넣지 않은 스킬 id */
  skippedIds: number[]
}

/**
 * 조건에 없는 스킬만 세팅의 레벨로 원하는 스킬에 더한다 (그 묶음 끝, 맨 아래 구분선보다 아래 — addRequiredSkill).
 * 이미 있는 스킬은 레벨·끄기·고정 모두 그대로 둔다. 비선호 스킬은 원하는 스킬과 함께 둘 수 없어서 넣지 않는다.
 * 무기·옵션 등 나머지 조건도 그대로
 */
export function addBuildSkills(db: GameDb, skills: readonly SkillPoint[], cond: SearchConditions): AddedSkills {
  const excluded = new Set(cond.excluded)
  let list: Pick<SearchConditions, 'required' | 'requiredDividers'> = cond
  const added: SkillPoint[] = []
  const skippedIds: number[] = []
  for (const point of skills) {
    const skill = db.skills.get(point.skillId)
    if (!skill || list.required.some((r) => r.skillId === skill.id)) continue
    if (excluded.has(skill.id)) {
      skippedIds.push(skill.id)
      continue
    }
    // addRequiredSkill 은 최대 레벨로 넣으므로 세팅의 레벨로 맞춘다
    const next = addRequiredSkill(db, list, skill)
    list = { ...next, required: next.required.map((r) => (r.skillId === skill.id ? { ...r, level: point.level } : r)) }
    added.push(point)
  }
  return { cond: { ...cond, ...list }, added, skippedIds }
}

export interface BuildConditions extends AddedSkills {
  /** 검색할 무기가 바뀌었는지 (무기 조건의 값이 달라도 검색하는 무기가 같으면 false) */
  weaponChanged: boolean
}

/**
 * 세팅의 발동 스킬(시리즈·그룹 포함)을 세팅과 같은 레벨로 원하는 스킬에 둔 새 조건. 그 세팅과 같은 스킬로 다른 조합을 찾을 때 쓴다.
 * 원래 원하는 스킬·구분선은 지운다. 세팅에 무기가 있으면 무기 조건도 그 무기로: 무기 스킬은 무기와 무기 슬롯에 달려 있어
 * 다른 무기로는 같은 스킬이 안 나올 수 있다. 무기 없는 세팅이면 지금 무기를 둔다 (무기는 스킬·슬롯을 더하기만 해서 세팅의
 * 스킬은 그대로 나온다). 비선호 스킬은 넣지 않고, 나머지 조건(비선호·호석·옵션·정렬 …)은 그대로
 */
export function conditionsFromBuild(
  db: GameDb,
  build: BuildState,
  customTalismans: readonly CustomTalisman[],
  current: SearchConditions,
): BuildConditions {
  const weapon = build.weapon ? weaponConditionOf(db, build.weapon) : null
  const base: SearchConditions = { ...current, ...weapon, required: [], requiredDividers: [] }
  const result = addBuildSkills(db, buildSkills(db, build, customTalismans), base)
  const sameWeapon = JSON.stringify(weaponChoiceOf(db, base)) === JSON.stringify(weaponChoiceOf(db, current))
  return { ...result, weaponChanged: !sameWeapon }
}
