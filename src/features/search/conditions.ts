// 스킬 검색 조건 (localStorage 저장 형식)과 SearchRequest 변환
import { resolveTalisman, resolveWeapon } from '../../core/equipment'
import { customWeaponChoice, dbWeaponChoice, gogmaSkillsOf } from '../../core/gogmaArtian'
import { hr100ArmorIds, isHr100Talisman } from '../../core/hunterRank'
import type { ExcludeMode, SearchRequest, SearchSort, SearchTalisman } from '../../core/search/types'
import type { CustomTalisman, TalismanRef, WeaponChoice } from '../../core/types'
import type { GameDb } from '../../data/db'
import { WEAPON_KINDS, type FixedTalisman, type SkillPoint, type SlotLevel, type WeaponKind } from '../../data/types'

export type WeaponMode = 'none' | 'db' | 'custom'
export type TalismanMode = 'auto' | 'custom-only' | 'fixed' | 'none'

/** 원하는 스킬. off 면 목록에는 남겨 두고 검색 요청에서만 뺀다 (예전 저장값엔 없음 = 켜짐) */
export interface RequiredSkill extends SkillPoint {
  off?: boolean
}

export interface SearchConditions {
  required: RequiredSkill[]
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
  transcend: boolean
  useDecorations: boolean
  sort: SearchSort
}

export const DEFAULT_CONDITIONS: SearchConditions = {
  required: [],
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
  transcend: false,
  useDecorations: true,
  sort: 'slots',
}

export const RESULT_LIMIT = 200

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
  return cond
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
    // off 를 떼어 내야 껐다 다시 켠 요청이 처음 요청과 같은 키가 된다
    required: cond.required
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
    excludedArmorIds: cond.excludeHr100 ? hr100ArmorIds(db) : [],
    sort: cond.sort,
    limit: RESULT_LIMIT,
  }
}

/** 정렬만 다른 요청인지 비교할 때 쓰는 키 */
export function requestKey(request: SearchRequest): string {
  return JSON.stringify({ ...request, sort: undefined })
}
