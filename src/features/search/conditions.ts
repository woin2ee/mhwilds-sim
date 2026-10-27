// 스킬 검색 조건 (localStorage 저장 형식)과 SearchRequest 변환
import { resolveTalisman, resolveWeapon } from '../../core/equipment'
import { customWeaponChoice, dbWeaponChoice, gogmaSkillsOf } from '../../core/gogmaArtian'
import { hr100ArmorIds, isHr100Talisman } from '../../core/hunterRank'
import type { ExcludeMode, SearchRequest, SearchSort, SearchTalisman } from '../../core/search/types'
import type { CustomTalisman, Slot, SlotKind, TalismanRef, WeaponChoice } from '../../core/types'
import type { GameDb } from '../../data/db'
import {
  WEAPON_KINDS,
  type FixedTalisman,
  type Skill,
  type SkillKind,
  type SkillPoint,
  type SlotLevel,
  type WeaponKind,
} from '../../data/types'
import { excludedArmorIds, isExcludedArmor, type ExcludedArmor } from './excludedArmor'

export type WeaponMode = 'none' | 'db' | 'custom'
export type TalismanMode = 'auto' | 'custom-only' | 'fixed' | 'none'

/** 원하는 스킬. off 면 목록에는 남겨 두고 검색 요청에서만 뺀다 (예전 저장값엔 없음 = 켜짐) */
export interface RequiredSkill extends SkillPoint {
  off?: boolean
  /** 고정: 조건을 채우는 조합이 없어 가장 가까운 조합을 찾을 때도 이 레벨은 꼭 채운다 (예전 저장값엔 없음 = 낮출 수 있음) */
  locked?: boolean
}

/**
 * 원하는 스킬 목록에 끼워 두는 가로 구분선 (목록을 나눠 보는 용도라 검색 요청에는 넣지 않음).
 * 자리는 같은 묶음에서 구분선 위에 있는 스킬 수라서, 새 스킬은 늘 맨 아래 구분선보다 아래(묶음 끝)에 들어간다
 */
export interface RequiredDivider {
  id: string
  kind: SkillKind
  /** 같은 묶음에서 이 구분선 위에 있는 스킬 수. 0 = 묶음 맨 위 */
  index: number
}

/**
 * 장식주 여유분: 종류마다 결과에 더 끼울 장식주 수 [크기1, 크기2, 크기3]. 남는 슬롯에 그만큼 들어가야 한다
 * (크기 k 장식주는 레벨 k 이상 슬롯 하나, DESIGN.md §6.8)
 */
export type SpareSlots = Record<SlotKind, [number, number, number]>

/** 장식주 여유분 한 칸(종류·크기)에 고를 수 있는 최대 개수 */
export const SPARE_MAX = 5

export interface SearchConditions {
  required: RequiredSkill[]
  /** 원하는 스킬 목록의 구분선 (예전 저장값엔 없음 = 없음) */
  requiredDividers: RequiredDivider[]
  excluded: number[]
  excludeMode: ExcludeMode
  weaponMode: WeaponMode
  weaponKind: WeaponKind
  weaponId: number | null
  /**
   * 거극 아티어 무기(또는 슬롯 직접 지정)에 붙은 시리즈/그룹 스킬.
   * 거극 아티어가 아닌 무기를 고르거나 무기 미지정이면 요청에는 넣지 않고 조건에만 남겨 둔다
   */
  weaponSetSkillId: number | null
  weaponGroupSkillId: number | null
  /** 슬롯 직접 지정: 3칸, 0 = 없음 */
  customWeaponSlots: number[]
  customWeaponSkills: SkillPoint[]
  talismanMode: TalismanMode
  fixedTalisman: TalismanRef | null
  includeLowRank: boolean
  /** HR 100 이상에서만 얻는 방어구를 빼고, 자동 호석은 HR 100 전에 만들 수 있는 등급까지만 (core/hunterRank.ts) */
  excludeHr100: boolean
  /** 검색에서 뺄 방어구·세트·계열 (예전 저장값엔 없음 = 없음). 가진 장비에 따라 정하는 것이라 저장한 조건에는 담지 않는다 */
  excludedArmor: ExcludedArmor[]
  transcend: boolean
  useDecorations: boolean
  /** 장식주 여유분 (예전 저장값엔 없음 = 없음) */
  spareSlots: SpareSlots
  sort: SearchSort
}

export const DEFAULT_CONDITIONS: SearchConditions = {
  required: [],
  requiredDividers: [],
  excluded: [],
  excludeMode: 'mark',
  weaponMode: 'none',
  weaponKind: 'great-sword',
  weaponId: null,
  weaponSetSkillId: null,
  weaponGroupSkillId: null,
  customWeaponSlots: [0, 0, 0],
  customWeaponSkills: [],
  talismanMode: 'auto',
  fixedTalisman: null,
  includeLowRank: false,
  excludeHr100: false,
  excludedArmor: [],
  transcend: false,
  useDecorations: true,
  spareSlots: { armor: [0, 0, 0], weapon: [0, 0, 0] },
  sort: 'slots',
}

export const RESULT_LIMIT = 200
/**
 * 조건을 모두 채우는 조합이 없을 때 대신 보여 줄 조합이 모자라도 되는 레벨 합의 상한.
 * 넉넉히 둬서 사실상 가장 가까운(가장 적게 모자란) 조합을 찾는다
 */
export const MAX_SHORTFALL = 99

export function isStoredConditions(value: unknown): value is Partial<SearchConditions> {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.required) && Array.isArray(v.excluded)
}

/** 저장된 값에 빠진 필드를 기본값으로 채우고 잘못된 값을 걸러낸다 */
export function normalizeConditions(stored: Partial<SearchConditions>): SearchConditions {
  const cond = { ...DEFAULT_CONDITIONS, ...stored }
  // 예전 저장값 'deprioritize'(비선호 결과를 아래에 따로)는 같은 정렬에 섞어 표시하는 'mark' 로 바뀌었다
  if (cond.excludeMode !== 'exclude') cond.excludeMode = 'mark'
  if (!WEAPON_KINDS.includes(cond.weaponKind)) cond.weaponKind = DEFAULT_CONDITIONS.weaponKind
  if (!Number.isInteger(cond.weaponSetSkillId)) cond.weaponSetSkillId = null
  if (!Number.isInteger(cond.weaponGroupSkillId)) cond.weaponGroupSkillId = null
  const slots = Array.isArray(cond.customWeaponSlots) ? cond.customWeaponSlots : []
  cond.customWeaponSlots = [0, 1, 2].map((i) => Math.max(0, Math.min(3, Number(slots[i]) || 0)))
  cond.requiredDividers = Array.isArray(cond.requiredDividers) ? cond.requiredDividers.filter(isRequiredDivider) : []
  cond.excludedArmor = Array.isArray(cond.excludedArmor) ? cond.excludedArmor.filter(isExcludedArmor) : []
  cond.spareSlots = normalizeSpareSlots(cond.spareSlots)
  return cond
}

/** 장식주 여유분 저장값: 종류마다 크기 3칸을 0~SPARE_MAX 정수로 (모양이 틀린 칸은 0) */
export function normalizeSpareSlots(value: unknown): SpareSlots {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const counts = (kind: SlotKind): [number, number, number] => {
    const list: unknown[] = Array.isArray(v[kind]) ? v[kind] : []
    const at = (i: number) => {
      const n = list[i]
      return typeof n === 'number' && Number.isInteger(n) ? Math.max(0, Math.min(SPARE_MAX, n)) : 0
    }
    return [at(0), at(1), at(2)]
  }
  return { armor: counts('armor'), weapon: counts('weapon') }
}

/** 장식주 여유분 → 슬롯 목록. 남은 슬롯 요약과 같은 순서 (무기 먼저, 같은 종류면 크기 큰 순) */
export function spareSlotList(spare: SpareSlots): Slot[] {
  const slots: Slot[] = []
  for (const kind of ['weapon', 'armor'] as const) {
    for (const level of [3, 2, 1] as const) {
      for (let i = 0; i < spare[kind][level - 1]; i++) slots.push({ kind, level })
    }
  }
  return slots
}

/**
 * 원하는 스킬 목록은 스킬 종류로 묶어 스킬 선택 상자(SkillSelect)와 같은 방어구 → 무기 → 시리즈 → 그룹 순서로 보여 주고,
 * 순서는 묶음 안에서만 바꾼다
 */
export const REQUIRED_KIND_ORDER: readonly SkillKind[] = ['armor', 'weapon', 'set', 'group']

/** 묶음 자리. 데이터에 없는 스킬은 맨 뒤 */
function groupRank(db: GameDb, skillId: number): number {
  const skill = db.skills.get(skillId)
  return skill ? REQUIRED_KIND_ORDER.indexOf(skill.kind) : REQUIRED_KIND_ORDER.length
}

/** 묶음 순서로 늘어놓는다. 묶음 안에서는 원래 순서를 지킨다 (정렬은 안정적) */
export function sortRequired<T extends SkillPoint>(db: GameDb, required: readonly T[]): T[] {
  return [...required].sort((a, b) => groupRank(db, a.skillId) - groupRank(db, b.skillId))
}

export function isRequiredDivider(value: unknown): value is RequiredDivider {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    REQUIRED_KIND_ORDER.includes(v.kind as SkillKind) &&
    Number.isInteger(v.index) &&
    (v.index as number) >= 0
  )
}

/** 원하는 스킬 한 묶음의 줄. 화면은 스킬과 구분선을 이 순서로 늘어놓고, 옮기거나 지운 결과도 이 모양으로 돌려준다 */
export type RequiredItem = { type: 'skill'; required: RequiredSkill } | { type: 'divider'; divider: RequiredDivider }

const isKind = (db: GameDb, skillId: number, kind: SkillKind) => db.skills.get(skillId)?.kind === kind

/**
 * kind 묶음의 줄을 화면 순서로. 같은 자리의 구분선은 저장 순서대로, 자리가 스킬 수를 넘으면 맨 아래.
 * 스킬이 없는 묶음은 구분선도 없는 것으로 본다
 */
export function requiredLayout(
  db: GameDb,
  required: readonly RequiredSkill[],
  dividers: readonly RequiredDivider[],
  kind: SkillKind,
): RequiredItem[] {
  const skills = required.filter((r) => isKind(db, r.skillId, kind))
  if (skills.length === 0) return []
  const lines = dividers.filter((d) => d.kind === kind)
  const items: RequiredItem[] = []
  for (let i = 0; i <= skills.length; i++) {
    for (const divider of lines) if (Math.min(divider.index, skills.length) === i) items.push({ type: 'divider', divider })
    if (i < skills.length) items.push({ type: 'skill', required: skills[i] })
  }
  return items
}

/**
 * kind 묶음의 줄(화면 순서)을 저장값으로 돌린다: 그 묶음 스킬을 이 순서로 두고(다른 묶음은 그대로)
 * 구분선 자리(위에 있는 스킬 수)를 다시 센다. 묶음에 스킬이 하나도 안 남으면 그 묶음 구분선도 지운다
 */
export function applyRequiredLayout(
  db: GameDb,
  required: readonly RequiredSkill[],
  dividers: readonly RequiredDivider[],
  kind: SkillKind,
  items: readonly RequiredItem[],
): Pick<SearchConditions, 'required' | 'requiredDividers'> {
  const skills: RequiredSkill[] = []
  const lines: RequiredDivider[] = []
  for (const item of items) {
    if (item.type === 'skill') skills.push(item.required)
    else lines.push({ ...item.divider, kind, index: skills.length })
  }
  return {
    required: sortRequired(db, [...required.filter((r) => !isKind(db, r.skillId, kind)), ...skills]),
    requiredDividers: [...dividers.filter((d) => d.kind !== kind), ...(skills.length > 0 ? lines : [])],
  }
}

type RequiredList = Pick<SearchConditions, 'required' | 'requiredDividers'>

/** 원하는 스킬을 최대 레벨로 그 묶음의 끝(맨 아래 구분선보다 아래)에 넣는다. 이미 있으면 그대로 */
export function addRequiredSkill(db: GameDb, list: RequiredList, skill: Skill): RequiredList {
  if (list.required.some((r) => r.skillId === skill.id)) return list
  return applyRequiredLayout(db, list.required, list.requiredDividers, skill.kind, [
    ...requiredLayout(db, list.required, list.requiredDividers, skill.kind),
    { type: 'skill', required: { skillId: skill.id, level: skill.maxLevel } },
  ])
}

/** 원하는 스킬 하나를 뺀다. 그 묶음 구분선의 자리는 다시 센다 */
export function removeRequiredSkill(db: GameDb, list: RequiredList, skillId: number): RequiredList {
  const kind = db.skills.get(skillId)?.kind
  if (!kind) return { ...list, required: list.required.filter((r) => r.skillId !== skillId) }
  const items = requiredLayout(db, list.required, list.requiredDividers, kind)
  return applyRequiredLayout(
    db,
    list.required,
    list.requiredDividers,
    kind,
    items.filter((item) => item.type !== 'skill' || item.required.skillId !== skillId),
  )
}

/**
 * 결과를 만든 요청의 원하는 스킬을 order(지금 조건) 순서로 늘어놓는다. 순서만 바꾸면 다시 검색하지 않아도 되므로
 * (requestKey) 결과 칩이 바로 지금 순서를 따르게 한다. order 에 없는 스킬은 원래 순서대로 맨 뒤.
 * 순서가 이미 같으면 같은 요청 객체를 돌려준다 (결과 카드가 다시 계산하지 않게)
 */
export function withRequiredOrder(request: SearchRequest, order: readonly SkillPoint[]): SearchRequest {
  const index = new Map(order.map((r, i) => [r.skillId, i]))
  const rank = (r: SkillPoint) => index.get(r.skillId) ?? order.length
  const required = [...request.required].sort((a, b) => rank(a) - rank(b))
  return required.every((r, i) => r === request.required[i]) ? request : { ...request, required }
}

export function weaponChoiceOf(db: GameDb, cond: SearchConditions): WeaponChoice | null {
  // 거극 아티어 스킬은 거극 아티어 무기나 슬롯 직접 지정일 때만 담는다 (gogmaSkillsOf 가 거른다)
  const gogma = { setSkillId: cond.weaponSetSkillId ?? undefined, groupSkillId: cond.weaponGroupSkillId ?? undefined }
  if (cond.weaponMode === 'db') {
    if (cond.weaponId === null) return null
    return dbWeaponChoice(cond.weaponId, gogmaSkillsOf(db, { type: 'db', id: cond.weaponId, ...gogma }))
  }
  if (cond.weaponMode === 'custom') {
    const slots = cond.customWeaponSlots.filter((l) => l > 0).sort((a, b) => b - a) as SlotLevel[]
    const skills = cond.customWeaponSkills
    return customWeaponChoice(slots, skills, gogmaSkillsOf(db, { type: 'custom', slots, skills, ...gogma }))
  }
  return null
}

/** 계열마다 가장 높은 등급의 제작 호석. HR 100 장비를 빼면 HR 100 전에 만들 수 있는 가장 높은 등급 */
function topFixedTalismans(db: GameDb, excludeHr100: boolean): FixedTalisman[] {
  if (!excludeHr100) return db.data.talismans.filter((t) => t.isMaxRank)
  const best = new Map<number, FixedTalisman>()
  for (const t of db.data.talismans) {
    if (isHr100Talisman(t)) continue
    const prev = best.get(t.charmId)
    if (!prev || t.level > prev.level) best.set(t.charmId, t)
  }
  return db.data.talismans.filter((t) => best.get(t.charmId) === t)
}

/** 호석 모드에 따른 후보 호석 */
export function talismanRefsOf(
  db: GameDb,
  cond: SearchConditions,
  customTalismans: readonly CustomTalisman[],
): TalismanRef[] {
  const custom: TalismanRef[] = customTalismans.map((t) => ({ type: 'custom', id: t.id }))
  switch (cond.talismanMode) {
    case 'auto':
      return [
        ...topFixedTalismans(db, cond.excludeHr100).map((t): TalismanRef => ({ type: 'fixed', id: t.id })),
        ...custom,
      ]
    case 'custom-only':
      return custom
    case 'fixed':
      return cond.fixedTalisman ? [cond.fixedTalisman] : []
    case 'none':
      return []
  }
}

/** 검색에서 뺄 방어구 id: HR 100 장비 + 제외할 방어구 (id 순, 중복 없음) */
function excludedArmorIdsOf(db: GameDb, cond: SearchConditions): number[] {
  const ids = new Set(excludedArmorIds(db, cond.excludedArmor))
  if (cond.excludeHr100) for (const id of hr100ArmorIds(db)) ids.add(id)
  return [...ids].sort((a, b) => a - b)
}

export function buildRequest(
  db: GameDb,
  cond: SearchConditions,
  customTalismans: readonly CustomTalisman[],
): SearchRequest {
  const choice = weaponChoiceOf(db, cond)
  const weapon = resolveWeapon(db, choice)
  const talismans: SearchTalisman[] = []
  for (const ref of talismanRefsOf(db, cond, customTalismans)) {
    const resolved = resolveTalisman(db, ref, customTalismans)
    if (resolved) talismans.push({ ref, skills: resolved.skills, slots: resolved.slots })
  }
  return {
    // off 를 떼어 내야 껐다 다시 켠 요청이 처음 요청과 같은 키가 된다.
    // 순서는 원하는 스킬 목록과 같은 묶음 순서 (결과 카드의 원하는 스킬 칩·세팅 기본 이름이 따른다)
    required: sortRequired(db, cond.required)
      .filter((r) => !r.off && db.skills.has(r.skillId) && r.level > 0)
      .map(({ skillId, level }) => ({ skillId, level })),
    excludedSkills: cond.excluded.filter((id) => db.skills.has(id)),
    excludeMode: cond.excludeMode,
    weapon: {
      choice: weapon ? choice : null,
      skills: weapon?.skills ?? [],
      slots: weapon?.slots.map((s) => s.level) ?? [],
    },
    talismans,
    includeLowRank: cond.includeLowRank,
    transcend: cond.transcend,
    useDecorations: cond.useDecorations,
    spareSlots: spareSlotList(cond.spareSlots),
    excludedArmorIds: excludedArmorIdsOf(db, cond),
    sort: cond.sort,
    limit: RESULT_LIMIT,
    maxShortfall: MAX_SHORTFALL,
    // 원하는 스킬 순서를 바꿔도 같은 요청이 되게 id 순으로 (requestKey)
    lockedSkills: cond.required
      .filter((r) => r.locked && !r.off && db.skills.has(r.skillId) && r.level > 0)
      .map((r) => r.skillId)
      .sort((a, b) => a - b),
  }
}

/** 정렬이나 원하는 스킬 순서만 다른 요청인지 비교할 때 쓰는 키 (원하는 스킬 순서는 결과 칩 순서만 바꾼다) */
export function requestKey(request: SearchRequest): string {
  const required = [...request.required].sort((a, b) => a.skillId - b.skillId)
  return JSON.stringify({ ...request, required, sort: undefined })
}
