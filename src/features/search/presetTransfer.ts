// 저장한 검색 조건 내보내기·가져오기 (DESIGN.md §8.4). 검색 조건 코드와 파일이 같은 SearchPresetsFile 을 담는다
import { sameTalisman } from '../../core/buildUpdates'
import { NAME_MAX } from '../../core/savedBuilds'
import { ShareCodeError, textCode } from '../../core/share'
import type { CustomTalisman, Slot, TalismanDraft, TalismanRef } from '../../core/types'
import type { GameDb } from '../../data/db'
import { ARMOR_KINDS, WEAPON_KINDS, type ArmorKind, type ArmorSet, type SkillPoint } from '../../data/types'
import {
  DEFAULT_CONDITIONS,
  isRequiredDivider,
  normalizeConditions,
  normalizeSpareSlots,
  type RequiredDivider,
  type RequiredSkill,
  type TalismanMode,
  type WeaponMode,
} from './conditions'
import { addExcludedArmor, type ExcludedArmor } from './excludedArmor'
import { conditionsKey, presetPart, type PresetConditions, type SearchPreset } from './presets'

// ---- 코드 ----

/** 'mhwilds-search-<형식 버전>.' + base64url. 백업 코드와 같은 방식이고 앞머리로 가린다 */
const presetsCode = textCode('search', '검색 조건 코드', '파일')

/** 붙여 넣은 글에 검색 조건 코드가 들어 있는지 */
export const hasPresetsCode = (text: string): boolean => presetsCode.has(text)

export const encodePresetsCode = (file: SearchPresetsFile): Promise<string> => presetsCode.encode(file)

/** 검색 조건 코드 → importPresets 에 넘길 값. 형식이 틀리면 ShareCodeError */
export const decodePresetsCode = (text: string): Promise<unknown> => presetsCode.decode(text)

// ---- 형식 ----

/**
 * 내보낸 고정 호석. 제작 호석은 (계열 gameId, 등급), 내 호석은 내용(스킬은 게임 내부 id)을 담아
 * 가져오는 쪽에서 내용이 같은 내 호석에 잇는다
 */
export type PortableTalisman =
  | { type: 'fixed'; charmGameId: number; level: number }
  | { type: 'custom'; talisman: TalismanDraft }

/**
 * 내보낸 조건. 저장한 조건(PresetConditions)과 모양이 같고 스킬·무기 id 만 게임 내부 id 다
 * (데이터를 다시 만들어 MHDB id 가 바뀌어도 찾게, §8.1). 무기 gameId 는 종류마다 따로 매겨져서 weaponKind 와 함께 본다.
 * id 를 담는 필드가 새로 생기면 portableConditions·restoreConditions 에서 바꿔 준다
 */
export type PortableConditions = Omit<PresetConditions, 'fixedTalisman'> & { fixedTalisman: PortableTalisman | null }

/** 내보낸 제외할 방어구. 방어구는 (세트 gameId, 부위), 세트·계열은 세트 gameId (계열은 계열 안 아무 세트) */
export type PortableExcludedArmor =
  | { type: 'piece'; setGameId: number; kind: ArmorKind }
  | { type: 'set' | 'series'; setGameId: number }

export interface SearchPresetsFile {
  app: 'mhwilds-sim'
  kind: 'search-presets'
  version: 1
  exportedAt: string
  /** 내보낼 때의 데이터 버전 (참고용) */
  dataVersion: string
  presets: { name: string; updatedAt: string; conditions: PortableConditions }[]
  /**
   * '제외할 방어구도 내보내기'를 고르면 지금 제외 목록 (없으면 필드가 없다). 저장한 조건에는 담지 않는 값이라 조건과 따로 둔다
   * (DESIGN.md §7.2)
   */
  excludedArmor?: PortableExcludedArmor[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

/** JSON 값이 내보낸 검색 조건인지 (백업 탭에 잘못 넣었을 때 안내한다) */
export function isPresetsFile(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.app === 'mhwilds-sim' && value.kind === 'search-presets'
}

// ---- 내보내기 ----

/** 저장한 조건을 내보낸다. excludedArmor 를 주면 지금 제외 목록도 함께 ('제외할 방어구도 내보내기') */
export function createPresetsFile(
  db: GameDb,
  presets: readonly SearchPreset[],
  customTalismans: readonly CustomTalisman[],
  excludedArmor: readonly ExcludedArmor[] = [],
): SearchPresetsFile {
  const excluded = portableExcludedArmor(db, excludedArmor)
  return {
    app: 'mhwilds-sim',
    kind: 'search-presets',
    version: 1,
    exportedAt: new Date().toISOString(),
    dataVersion: db.data.meta.mhdbVersion,
    presets: presets.map((p) => ({
      name: p.name,
      updatedAt: p.updatedAt,
      conditions: portableConditions(db, p.conditions, customTalismans),
    })),
    ...(excluded.length > 0 ? { excludedArmor: excluded } : {}),
  }
}

function portableConditions(
  db: GameDb,
  stored: PresetConditions,
  customTalismans: readonly CustomTalisman[],
): PortableConditions {
  // 저장한 뒤 생긴 필드도 기본값으로 채워 담는다
  const cond = presetPart(normalizeConditions(stored))
  const gameIdOf = (id: number | null) => (id === null ? null : (db.skills.get(id)?.gameId ?? null))
  const weapon = cond.weaponId === null ? undefined : db.weapons.get(cond.weaponId)
  return {
    ...cond,
    required: portablePoints(db, cond.required),
    excluded: cond.excluded.flatMap((id) => gameIdOf(id) ?? []),
    weaponKind: weapon?.kind ?? cond.weaponKind,
    weaponId: weapon?.gameId ?? null,
    weaponSetSkillId: gameIdOf(cond.weaponSetSkillId),
    weaponGroupSkillId: gameIdOf(cond.weaponGroupSkillId),
    customWeaponSkills: portablePoints(db, cond.customWeaponSkills),
    fixedTalisman: portableTalisman(db, cond.fixedTalisman, customTalismans),
  }
}

/** 스킬 id → 게임 내부 id (데이터에 없는 스킬은 뺀다). 나머지 필드(off·locked)는 그대로 */
function portablePoints<T extends SkillPoint>(db: GameDb, points: readonly T[]): T[] {
  return points.flatMap((p) => {
    const skill = db.skills.get(p.skillId)
    return skill ? [{ ...p, skillId: skill.gameId }] : []
  })
}

function portableTalisman(
  db: GameDb,
  ref: TalismanRef | null,
  customTalismans: readonly CustomTalisman[],
): PortableTalisman | null {
  if (ref?.type === 'fixed') {
    const fixed = db.talismans.get(ref.id)
    return fixed ? { type: 'fixed', charmGameId: fixed.charmGameId, level: fixed.level } : null
  }
  const mine = ref ? customTalismans.find((t) => t.id === ref.id) : undefined
  if (!mine) return null
  const { name, rarity, skills, slots } = mine
  const talisman = { name, rarity, skills: portablePoints(db, skills), slots: slots.map((s) => ({ ...s })) }
  return { type: 'custom', talisman }
}

/** 데이터에 없는 방어구·세트는 뺀다 */
function portableExcludedArmor(db: GameDb, entries: readonly ExcludedArmor[]): PortableExcludedArmor[] {
  return entries.flatMap((entry): PortableExcludedArmor[] => {
    if (entry.type === 'piece') {
      const piece = db.armor.get(entry.id)
      const set = piece && db.armorSets.get(piece.setId)
      return piece && set ? [{ type: 'piece', setGameId: set.gameId, kind: piece.kind }] : []
    }
    const set = db.armorSets.get(entry.id)
    return set ? [{ type: entry.type, setGameId: set.gameId }] : []
  })
}

// ---- 가져오기 ----

export interface PresetImportEntry {
  /** 가져올 조건 (새 id) */
  preset: SearchPreset
  /** 이름과 조건이 같은 저장한 조건이 이미 있어 건너뛴다 */
  exists: boolean
  /** 현재 데이터나 내 호석에서 찾지 못해 비운 항목 (예: '원하는 스킬 1개', "고정 호석 '호석 3'(내 호석에 없음)") */
  missing: string[]
  /** 고정한 내 호석과 같은 호석이 내 호석에 없다 (다른 기기에서 옮기는 중이면 백업으로 내 호석을 먼저 옮기면 이어진다) */
  talismanMissing: boolean
}

export interface PresetImportResult {
  entries: PresetImportEntry[]
  /** 새로 더할 조건 (파일 순서) */
  added: SearchPreset[]
  /** 새 조건을 지금 목록 맨 위에 더한 전체 목록 */
  presets: SearchPreset[]
  /** 함께 내보낸 제외할 방어구 (없으면 null). '제외할 방어구도 가져오기'를 고를 때만 지금 조건에 쓴다 */
  excludedArmor: ExcludedArmorImport | null
  /** 내보낸 시각 (ISO, 없으면 null) */
  exportedAt: string | null
}

export interface ExcludedArmorImport {
  /** 내보낸 제외할 방어구 (현재 데이터의 id, 찾지 못한 것은 뺐다) */
  entries: ExcludedArmor[]
  /** 지금 목록에 더한 목록 (addExcludedArmor: 이미 다 빠진 것은 그대로 두고, 새로 넣는 것 안에 다 드는 칩은 지운다) */
  merged: ExcludedArmor[]
  /** merged 에 새로 들어간 칩 수. 0 이면 이미 모두 빠져 있다 */
  added: number
  /** 현재 데이터에서 찾지 못한 수 */
  missing: number
}

/**
 * 내보낸 조건(파일의 JSON.parse 결과나 decodePresetsCode 결과)을 저장한 조건에 병합한다. 형식이 틀리면 ShareCodeError.
 * 상태를 바꾸지 않는 순수 함수라, 화면은 결과를 미리 보여 준 뒤 그대로 반영한다
 */
export function importPresets(
  db: GameDb,
  input: unknown,
  current: {
    presets: readonly SearchPreset[]
    customTalismans: readonly CustomTalisman[]
    excludedArmor: readonly ExcludedArmor[]
  },
  createId: () => string,
): PresetImportResult {
  const file = parseFile(input)
  const seen = new Set(current.presets.map(presetKey))
  const entries = file.presets.map((entry): PresetImportEntry => {
    const { conditions, missing, talismanMissing } = restoreConditions(db, entry.conditions, current.customTalismans)
    const preset: SearchPreset = { id: createId(), name: entry.name, conditions, updatedAt: entry.updatedAt }
    const key = presetKey(preset)
    const exists = seen.has(key)
    seen.add(key)
    return { preset, exists, missing, talismanMissing }
  })
  const added = entries.filter((e) => !e.exists).map((e) => e.preset)
  const excluded = restoreExcludedArmor(db, file.excludedArmor)
  return {
    entries,
    added,
    presets: [...added, ...current.presets],
    excludedArmor: excluded && { ...excluded, ...mergeExcludedArmor(db, current.excludedArmor, excluded.entries) },
    exportedAt: file.exportedAt,
  }
}

/** 이름과 조건이 모두 같으면 같은 조건 (백업의 세팅과 같은 기준) */
const presetKey = (preset: SearchPreset) => `${preset.name}\u0000${conditionsKey(preset.conditions)}`

const INVALID_FILE = '올바른 검색 조건 파일이 아니에요'

interface ParsedPreset {
  name: string
  updatedAt: string
  conditions: Record<string, unknown>
}

function parseFile(input: unknown): { presets: ParsedPreset[]; excludedArmor: unknown; exportedAt: string | null } {
  if (!isPresetsFile(input)) throw new ShareCodeError(INVALID_FILE)
  if (input.version !== 1) {
    const newer = isInt(input.version) && input.version > 1
    throw new ShareCodeError(newer ? '더 새로운 형식의 검색 조건이에요. 페이지를 새로고침해 보세요' : INVALID_FILE)
  }
  if (!Array.isArray(input.presets)) throw new ShareCodeError(INVALID_FILE)
  const now = new Date().toISOString()
  return {
    presets: input.presets.map((p): ParsedPreset => {
      if (!isRecord(p) || !isRecord(p.conditions)) throw new ShareCodeError(INVALID_FILE)
      const name = typeof p.name === 'string' ? p.name.trim().slice(0, NAME_MAX) : ''
      return {
        name: name || '이름 없는 조건',
        updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : now,
        conditions: p.conditions,
      }
    }),
    excludedArmor: input.excludedArmor,
    exportedAt: typeof input.exportedAt === 'string' ? input.exportedAt : null,
  }
}

const WEAPON_MODES: readonly WeaponMode[] = ['none', 'db', 'custom']
const TALISMAN_MODES: readonly TalismanMode[] = ['auto', 'custom-only', 'fixed', 'none']

const oneOf = <T>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const isSet = (value: unknown) => value !== null && value !== undefined

/**
 * 내보낸 조건 → 저장한 조건. 스킬·무기·호석은 게임 내부 id 로 찾고, 못 찾은 것은 비우고 missing 에 적는다.
 * 모르거나 틀린 값은 기본값으로 둔다 (새 버전이 더한 값이 있어도 나머지는 읽히게)
 */
function restoreConditions(
  db: GameDb,
  raw: Record<string, unknown>,
  customTalismans: readonly CustomTalisman[],
): { conditions: PresetConditions; missing: string[]; talismanMissing: boolean } {
  const d = DEFAULT_CONDITIONS
  const lost = { required: 0, excluded: 0, weaponSkills: 0 }

  const required: RequiredSkill[] = []
  for (const value of list(raw.required)) {
    const point = restorePoint(db, value)
    if (!point) lost.required++
    else if (!required.some((r) => r.skillId === point.skillId)) {
      const { off, locked } = value as Record<string, unknown>
      required.push({ ...point, ...(off === true ? { off } : {}), ...(locked === true ? { locked } : {}) })
    }
  }

  const excluded: number[] = []
  for (const gameId of list(raw.excluded)) {
    const skill = isInt(gameId) ? db.skillByGameId(gameId) : undefined
    if (!skill) lost.excluded++
    else if (!excluded.includes(skill.id)) excluded.push(skill.id)
  }

  const requiredDividers: RequiredDivider[] = []
  for (const value of list(raw.requiredDividers)) {
    if (!isRequiredDivider(value) || requiredDividers.some((v) => v.id === value.id)) continue
    requiredDividers.push({ id: value.id, kind: value.kind, index: value.index })
  }

  const weaponMode = oneOf(raw.weaponMode, WEAPON_MODES, d.weaponMode)
  const weaponKind = oneOf(raw.weaponKind, WEAPON_KINDS, d.weaponKind)
  const weapon = isInt(raw.weaponId) ? db.weaponByGameKey(weaponKind, raw.weaponId) : undefined
  const bonusSkill = (gameId: unknown, kind: 'set' | 'group'): number | null => {
    if (!isSet(gameId)) return null
    const skill = isInt(gameId) ? db.skillByGameId(gameId) : undefined
    if (skill?.kind === kind) return skill.id
    lost.weaponSkills++
    return null
  }
  const weaponSetSkillId = bonusSkill(raw.weaponSetSkillId, 'set')
  const weaponGroupSkillId = bonusSkill(raw.weaponGroupSkillId, 'group')
  const slots = list(raw.customWeaponSlots)
  const customWeaponSlots = [0, 1, 2].map((i) => {
    const level = slots[i]
    return isInt(level) ? Math.max(0, Math.min(3, level)) : 0
  })
  const customWeaponSkills: SkillPoint[] = []
  for (const value of list(raw.customWeaponSkills)) {
    const point = restorePoint(db, value)
    if (!point) lost.weaponSkills++
    else if (!customWeaponSkills.some((p) => p.skillId === point.skillId)) customWeaponSkills.push(point)
  }

  const talismanMode = oneOf(raw.talismanMode, TALISMAN_MODES, d.talismanMode)
  const talisman = restoreTalisman(db, raw.fixedTalisman, customTalismans)

  const conditions: PresetConditions = {
    required,
    requiredDividers,
    excluded,
    excludeMode: raw.excludeMode === 'exclude' ? 'exclude' : 'mark',
    weaponMode,
    weaponKind,
    weaponId: weapon?.id ?? null,
    weaponSetSkillId,
    weaponGroupSkillId,
    customWeaponSlots,
    customWeaponSkills,
    talismanMode,
    fixedTalisman: talisman.ref,
    includeLowRank: bool(raw.includeLowRank, d.includeLowRank),
    excludeHr100: bool(raw.excludeHr100, d.excludeHr100),
    transcend: bool(raw.transcend, d.transcend),
    useDecorations: bool(raw.useDecorations, d.useDecorations),
    // id 가 없는 값이라 저장값과 같은 검사로 읽는다 (없거나 틀린 칸은 0)
    spareSlots: normalizeSpareSlots(raw.spareSlots),
  }

  // 무기·호석은 그 모드일 때만 알린다 (다른 모드에서는 조건에 남아 있기만 하고 검색에 쓰지 않는다)
  const missing: string[] = []
  if (lost.required > 0) missing.push(`원하는 스킬 ${lost.required}개`)
  if (lost.excluded > 0) missing.push(`비선호 스킬 ${lost.excluded}개`)
  if (weaponMode === 'db' && isSet(raw.weaponId) && !weapon) missing.push('무기')
  if (lost.weaponSkills > 0) missing.push(`무기 스킬 ${lost.weaponSkills}개`)
  const talismanUsed = talismanMode === 'fixed'
  if (talismanUsed && talisman.missing) missing.push(talisman.missing)
  return { conditions, missing, talismanMissing: talismanUsed && !!talisman.unlinked }
}

/** { skillId: 게임 내부 id, level } → 현재 데이터의 스킬 (레벨은 최대 레벨까지). 못 찾거나 틀리면 null */
function restorePoint(db: GameDb, value: unknown): SkillPoint | null {
  if (!isRecord(value) || !isInt(value.skillId) || !isInt(value.level) || value.level < 1) return null
  const skill = db.skillByGameId(value.skillId)
  return skill ? { skillId: skill.id, level: Math.min(value.level, skill.maxLevel) } : null
}

/**
 * 고정 호석. 내 호석은 내용이 같은 내 호석(sameTalisman, 이름 무시)에 잇고, 없으면 비운다
 * (받은 조건의 호석을 내 호석에 넣지 않는다: 내 호석에는 실제로 가진 호석만, DESIGN.md §7.3)
 */
function restoreTalisman(
  db: GameDb,
  value: unknown,
  customTalismans: readonly CustomTalisman[],
): { ref: TalismanRef | null; missing?: string; unlinked?: boolean } {
  if (!isRecord(value)) return { ref: null }
  if (value.type === 'fixed') {
    const { charmGameId, level } = value
    const fixed = isInt(charmGameId) && isInt(level) ? db.talismanByGameKey(charmGameId, level) : undefined
    return fixed ? { ref: { type: 'fixed', id: fixed.id } } : { ref: null, missing: '고정 호석' }
  }
  if (value.type !== 'custom' || !isRecord(value.talisman)) return { ref: null }
  const draft = restoreDraft(db, value.talisman)
  const mine = draft ? customTalismans.find((t) => sameTalisman(t, draft)) : undefined
  if (mine) return { ref: { type: 'custom', id: mine.id } }
  const name = typeof value.talisman.name === 'string' && value.talisman.name ? value.talisman.name : '이름 없음'
  return { ref: null, missing: `고정 호석 '${name}'(내 호석에 없음)`, unlinked: true }
}

/** 내보낸 호석 내용. 찾지 못한 스킬이나 틀린 슬롯이 있으면 같은 호석을 찾을 수 없어 null */
function restoreDraft(db: GameDb, value: Record<string, unknown>): TalismanDraft | null {
  const skills: SkillPoint[] = []
  for (const p of list(value.skills)) {
    const point = restorePoint(db, p)
    if (!point) return null
    skills.push(point)
  }
  const slots: Slot[] = []
  for (const s of list(value.slots)) {
    if (!isRecord(s) || (s.kind !== 'armor' && s.kind !== 'weapon')) return null
    if (s.level !== 1 && s.level !== 2 && s.level !== 3) return null
    slots.push({ kind: s.kind, level: s.level })
  }
  return {
    name: typeof value.name === 'string' ? value.name : '',
    rarity: isInt(value.rarity) && value.rarity > 0 ? value.rarity : null,
    skills,
    slots,
  }
}

/** 내보낸 제외할 방어구 → 현재 데이터의 조건. 목록이 없거나 비면 null, 틀리거나 찾지 못한 항목은 missing 으로 센다 */
function restoreExcludedArmor(db: GameDb, value: unknown): { entries: ExcludedArmor[]; missing: number } | null {
  const items = list(value)
  if (items.length === 0) return null
  const sets = new Map(db.data.armorSets.map((set) => [set.gameId, set]))
  const entries: ExcludedArmor[] = []
  for (const item of items) {
    const entry = restoreExcludedEntry(db, sets, item)
    if (entry) entries.push(entry)
  }
  return { entries, missing: items.length - entries.length }
}

function restoreExcludedEntry(db: GameDb, sets: ReadonlyMap<number, ArmorSet>, value: unknown): ExcludedArmor | null {
  if (!isRecord(value) || !isInt(value.setGameId)) return null
  if (value.type === 'piece') {
    if (!ARMOR_KINDS.includes(value.kind as ArmorKind)) return null
    const piece = db.armorByGameKey(value.setGameId, value.kind as ArmorKind)
    return piece ? { type: 'piece', id: piece.id } : null
  }
  if (value.type !== 'set' && value.type !== 'series') return null
  const set = sets.get(value.setGameId)
  return set && set.pieceIds.length > 0 ? { type: value.type, id: set.id } : null
}

/** 지금 제외 목록에 하나씩 더한다 (화면에서 고를 때와 같은 addExcludedArmor). added 는 merged 에 남은 새 칩 수 */
function mergeExcludedArmor(
  db: GameDb,
  current: readonly ExcludedArmor[],
  entries: readonly ExcludedArmor[],
): { merged: ExcludedArmor[]; added: number } {
  let merged = [...current]
  for (const entry of entries) merged = addExcludedArmor(db, merged, entry)
  return { merged, added: merged.filter((entry) => entries.includes(entry)).length }
}
