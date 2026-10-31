// 세팅 → 세팅 검색 조건: 내 세팅 카드의 '검색 조건으로', 무기 조건의 '수동 세팅의 무기 가져오기' (DESIGN.md §7.2)
import { activeSkillLevels, computeBuild } from '../../core/calc'
import { canPlace, resolveWeapon } from '../../core/equipment'
import { gogmaSkillsOf } from '../../core/gogmaArtian'
import type { BuildState, CustomTalisman, Slot, WeaponChoice } from '../../core/types'
import type { GameDb } from '../../data/db'
import type { SkillPoint } from '../../data/types'
import { addRequiredSkill, sortRequired, weaponChoiceOf, type RequiredSkill, type SearchConditions } from './conditions'

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

/**
 * 세팅의 무기 장식주를 다른 무기의 슬롯에 옮겨 끼운다: 큰 장식주부터 들어가는 가장 작은 빈 슬롯에, 들어갈 슬롯이 없으면 뺀다.
 * 세팅의 무기 슬롯에 맞지 않던 장식주는 세팅에서도 세지 않았으므로 옮기지 않는다
 */
function refitWeaponDecorations(db: GameDb, build: BuildState, slots: readonly Slot[]): (number | null)[] {
  const ids = build.decorations.weapon ?? []
  const decorations = (resolveWeapon(db, build.weapon)?.slots ?? [])
    .flatMap((slot, i) => {
      const decoration = db.decorations.get(ids[i] ?? -1)
      return decoration && canPlace(decoration, slot) ? [decoration] : []
    })
    .sort((a, b) => b.size - a.size)
  const placed: (number | null)[] = slots.map(() => null)
  for (const decoration of decorations) {
    let best = -1
    slots.forEach((slot, i) => {
      if (placed[i] === null && canPlace(decoration, slot) && (best < 0 || slot.level < slots[best].level)) best = i
    })
    if (best >= 0) placed[best] = decoration.id
  }
  return placed
}

/**
 * 세팅을 다른 무기로 바꿔 낀 것처럼 다시 센 발동 스킬 (저장한 조건의 무기로 찾을 때). 무기 자체 스킬과 거극 아티어 시리즈·그룹
 * (1부위)은 그 무기 것으로 세고, 세팅의 무기 장식주는 그 무기 슬롯에 들어가는 만큼만 넣는다 (무기가 없으면 뺀다).
 * 세팅에 없던 스킬은 넣지 않고 세팅의 레벨을 넘지 않게 자른다 — 세팅의 방어구·장식주·호석으로 그 무기에서 낼 수 있는 레벨.
 * full 은 세팅의 발동 스킬 (buildSkills, 이미 셌으면 넘긴다)
 */
export function buildSkillsOn(
  db: GameDb,
  build: BuildState,
  customTalismans: readonly CustomTalisman[],
  weapon: WeaponChoice | null,
  full: readonly SkillPoint[] = buildSkills(db, build, customTalismans),
): SkillPoint[] {
  const slots = resolveWeapon(db, weapon)?.slots ?? []
  const decorations = { ...build.decorations, weapon: refitWeaponDecorations(db, build, slots) }
  const levels = activeSkillLevels(computeBuild(db, { ...build, weapon, decorations }, customTalismans))
  return full.flatMap((p) => {
    const level = Math.min(p.level, levels.get(p.skillId) ?? 0)
    return level > 0 ? [{ skillId: p.skillId, level }] : []
  })
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

export interface CheckedSkills {
  cond: SearchConditions
  /** 체크된 원하는 스킬 = 세팅에 있는 스킬 (목록 순서, 세팅보다 높던 레벨은 세팅의 레벨로) */
  checked: RequiredSkill[]
  /** 세팅의 레벨로 낮춘 스킬 수 */
  lowered: number
  /** 체크나 레벨을 바꾼 스킬이 있는지 */
  changed: boolean
}

/**
 * 원하는 스킬 중 세팅에 있는 스킬만 체크하고 나머지는 체크를 끈다. 새 스킬은 더하지 않는다 (조건에 없는 세팅 스킬은 빠진다).
 * 체크하는 스킬의 레벨이 세팅보다 높으면 세팅의 레벨로 낮춰서, 그 세팅이 늘 조건을 채운다 (같은 스킬로 다른 조합을 찾게).
 * 고정·순서·구분선과 무기·옵션 등 나머지 조건은 그대로 둔다
 */
export function checkBuildSkills(db: GameDb, skills: readonly SkillPoint[], cond: SearchConditions): CheckedSkills {
  const levels = new Map(skills.map((p) => [p.skillId, p.level]))
  let changed = false
  let lowered = 0
  const required = cond.required.map((r) => {
    const have = levels.get(r.skillId) ?? 0
    const off = have === 0
    const level = off ? r.level : Math.min(r.level, have)
    if (!!r.off === off && level === r.level) return r
    changed = true
    if (level < r.level) lowered++
    return { ...r, off, level }
  })
  return {
    cond: changed ? { ...cond, required } : cond,
    checked: sortRequired(db, required).filter((r) => !r.off),
    lowered,
    changed,
  }
}

/** 저장한 조건에 세팅의 스킬을 넣는 방법: 없는 스킬 더하기 / 있는 스킬만 체크 (새 스킬은 더하지 않음) */
export type PresetMode = 'add' | 'check'

/** 조건의 무기로 다시 세서 세팅보다 낮아진 스킬: level 은 세팅의 레벨, to 는 다시 센 레벨 (0 = 빠짐) */
export interface ReducedSkill extends SkillPoint {
  to: number
}

export interface BuildForPreset {
  /** 같은 무기면 무기의 거극 아티어 스킬을 세팅대로 맞춘 조건 (맞출 것이 없으면 받은 조건 그대로) */
  cond: SearchConditions
  /** 무기에 맞춰 붙인 거극 아티어 스킬 id (그 조건과 달랐던 것만) */
  gogmaIds: number[]
  /** cond 의 무기로 다시 센 세팅의 발동 스킬 (buildSkillsOn) */
  skills: SkillPoint[]
  /** 무기가 달라 빠지거나 낮아진 세팅 스킬 */
  reduced: ReducedSkill[]
}

/**
 * 저장한 조건에 세팅의 스킬을 넣기 전에 무기를 맞춘다. 세팅의 무기로 찾는 조건(searchesWithWeapon)이면 세팅의 무기에 고른 거극
 * 아티어 스킬을 그 조건의 무기에도 붙여 세팅의 무기를 그대로 재현한다 (세팅에서 고르지 않은 칸은 그 조건 것). 그 스킬은 무기가
 * 1부위로 세는 시리즈·그룹 스킬이라 없으면 세팅의 스킬이 안 나온다. 다른 무기·무기 미지정 조건이면 무기는 그대로 두고 세팅의 스킬을
 * 그 무기로 다시 센다 (buildSkillsOn: 무기에 달린 스킬은 빠지거나 낮아진다)
 */
export function buildForPreset(
  db: GameDb,
  build: BuildState,
  customTalismans: readonly CustomTalisman[],
  cond: SearchConditions,
): BuildForPreset {
  let next = cond
  const gogmaIds: number[] = []
  if (searchesWithWeapon(db, cond, build.weapon)) {
    const { setSkillId, groupSkillId } = gogmaSkillsOf(db, build.weapon)
    if (setSkillId !== null && setSkillId !== cond.weaponSetSkillId) gogmaIds.push(setSkillId)
    if (groupSkillId !== null && groupSkillId !== cond.weaponGroupSkillId) gogmaIds.push(groupSkillId)
    if (gogmaIds.length > 0) {
      next = {
        ...cond,
        weaponSetSkillId: setSkillId ?? cond.weaponSetSkillId,
        weaponGroupSkillId: groupSkillId ?? cond.weaponGroupSkillId,
      }
    }
  }
  const full = buildSkills(db, build, customTalismans)
  const skills = buildSkillsOn(db, build, customTalismans, weaponChoiceOf(db, next), full)
  const levels = new Map(skills.map((p) => [p.skillId, p.level]))
  const reduced = full.flatMap((p) => {
    const to = levels.get(p.skillId) ?? 0
    return to < p.level ? [{ ...p, to }] : []
  })
  return { cond: next, gogmaIds, skills, reduced }
}

export interface PresetFromBuild {
  cond: SearchConditions
  /** 더한 스킬(add, 세팅의 레벨) 또는 체크된 스킬(check, 목록 순서) */
  skills: SkillPoint[]
  /** 비선호 스킬이라 더하지 않은 스킬 id (add) */
  skippedIds: number[]
  /** 세팅의 레벨로 낮춘 스킬 수 (check) */
  lowered: number
  /** 무기에 맞춰 붙인 거극 아티어 스킬 id */
  gogmaIds: number[]
  /** 무기가 달라 빠지거나 낮아진 세팅 스킬 중 이 방법에 걸린 것 (add: 그 조건에 없던 스킬, check: 그 조건에 있던 스킬) */
  reduced: ReducedSkill[]
  /** 조건을 바꿨는지 (사용 중인 조건이라 그 조건에 저장된다) */
  changed: boolean
}

/** 저장한 조건에 세팅의 스킬을 넣은 결과 ('검색 조건으로'의 미리 보기와 불러오기가 같이 쓴다) */
export function presetFromBuild(
  db: GameDb,
  build: BuildState,
  customTalismans: readonly CustomTalisman[],
  cond: SearchConditions,
  mode: PresetMode,
): PresetFromBuild {
  const on = buildForPreset(db, build, customTalismans, cond)
  const listed = new Set(cond.required.map((r) => r.skillId))
  const weaponChanged = on.gogmaIds.length > 0
  if (mode === 'add') {
    const result = addBuildSkills(db, on.skills, on.cond)
    return {
      cond: result.cond,
      skills: result.added,
      skippedIds: result.skippedIds,
      lowered: 0,
      gogmaIds: on.gogmaIds,
      reduced: on.reduced.filter((p) => !listed.has(p.skillId)),
      changed: result.added.length > 0 || weaponChanged,
    }
  }
  const result = checkBuildSkills(db, on.skills, on.cond)
  return {
    cond: result.cond,
    skills: result.checked,
    skippedIds: [],
    lowered: result.lowered,
    gogmaIds: on.gogmaIds,
    reduced: on.reduced.filter((p) => listed.has(p.skillId)),
    changed: result.changed || weaponChanged,
  }
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
