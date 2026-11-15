// 백업 만들기/가져오기 (DESIGN.md §8.3). 파일과 백업 코드가 같은 BackupFile 을 담는다.
import type { GameDb } from '../../data/db'
import type { SkillPoint, SlotLevel, WeaponKind } from '../../data/types'
import { readTags, tagsField, tagsOf } from '../buildTags'
import { linkTalisman, sameTalisman } from '../buildUpdates'
import {
  compareEntries,
  fromBackupRoll,
  fromBackupBase,
  readProgress,
  toBackupBase,
  toBackupRoll,
  weaponLabel,
  type GogmaRoll,
  type RerollProgress,
  type RestoreRoll,
  type SkillIdMap,
} from '../gogmaRolls'
import { favoriteField, isFavorite, isWeaponKind, weaponKindField, type SavedBuild } from '../savedBuilds'
import type { BuildState, CustomTalisman, Slot, TalismanDraft } from '../types'
import { decodeBuild, encodeBuild } from './codec'
import { ShareCodeError, type BackupFile, type BackupImportResult } from './types'

const INVALID_BACKUP = '올바른 백업 파일이 아니에요'

/** 가져올 때 쓰지 않는 값(호석 id, 공유 코드 속 이름)은 빼서 백업 코드를 짧게 한다 */
export function createBackup(
  db: GameDb,
  savedBuilds: readonly SavedBuild[],
  customTalismans: readonly CustomTalisman[],
  reroll: { rolls?: readonly GogmaRoll[]; restores?: readonly RestoreRoll[]; progress?: RerollProgress } = {},
): BackupFile {
  const rolls = (reroll.rolls ?? []).map((r) => toBackupRoll(r, skillIds(db)))
  const restores = (reroll.restores ?? []).map(toBackupBase)
  const progress = reroll.progress && (reroll.progress.skill > 0 || reroll.progress.restore > 0) ? reroll.progress : null
  return {
    app: 'mhwilds-sim',
    kind: 'backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    dataVersion: db.data.meta.mhdbVersion,
    talismans: customTalismans.map((t) => ({
      name: t.name,
      rarity: t.rarity,
      skills: t.skills.map((p) => ({ ...p })),
      slots: t.slots.map((slot) => ({ ...slot })),
      skillGameIds: t.skills.map((p) => db.skills.get(p.skillId)?.gameId ?? null),
    })),
    builds: savedBuilds.map((s) => ({
      name: s.name,
      memo: s.memo,
      ...weaponKindField(s.weaponKind),
      ...tagsField(tagsOf(s)),
      ...favoriteField(isFavorite(s)),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      code: encodeBuild(db, s.build, customTalismans, null),
    })),
    ...(rolls.length > 0 ? { gogmaRolls: rolls } : {}),
    ...(restores.length > 0 ? { gogmaRestores: restores } : {}),
    ...(progress ? { gogmaProgress: { ...progress } } : {}),
  }
}

/** 리롤 기록의 스킬은 게임 내부 id 로 담는다 */
function skillIds(db: GameDb): SkillIdMap {
  return {
    toGameId: (id) => db.skills.get(id)?.gameId,
    fromGameId: (gameId) => db.skillByGameId(gameId)?.id,
  }
}

/**
 * 백업(파일의 JSON.parse 결과나 decodeBackupCode 결과)을 현재 목록에 병합한다. 형식이 틀리면 ShareCodeError.
 * 상태를 바꾸지 않는 순수 함수라, 화면은 결과를 미리 보여 준 뒤 그대로 반영한다.
 */
export function importBackup(
  db: GameDb,
  input: unknown,
  current: {
    savedBuilds: readonly SavedBuild[]
    customTalismans: readonly CustomTalisman[]
    gogmaRolls?: readonly GogmaRoll[]
    gogmaRestores?: readonly RestoreRoll[]
    gogmaProgress?: RerollProgress | null
  },
  createId: () => string,
): BackupImportResult {
  const file = parseBackup(input)
  const missing: string[] = []

  // 1) 호석: 내용이 같은 호석은 재사용
  const customTalismans = [...current.customTalismans]
  let addedTalismans = 0
  for (const entry of file.talismans) {
    const { draft, dropped } = restoreTalisman(db, entry)
    if (dropped > 0) missing.push(`호석 '${draft.name || '이름 없음'}': 스킬 ${dropped}개`)
    if (customTalismans.some((t) => sameTalisman(t, draft))) continue
    customTalismans.push({ ...draft, id: createId() })
    addedTalismans++
  }

  // 2) 세팅: 이름과 내용(코드)이 같으면 건너뜀. 세팅의 직접 입력 호석은 같은 내 호석에 연결하고, 없으면 세팅 전용으로 둔다
  const savedBuilds = [...current.savedBuilds]
  const seen = new Set(savedBuilds.map((s) => buildKey(db, s.name, s.build, customTalismans)))
  let addedBuilds = 0
  let skippedBuilds = 0
  for (const entry of file.builds) {
    let decoded
    try {
      decoded = decodeBuild(db, entry.code)
    } catch (err) {
      if (!(err instanceof ShareCodeError)) throw err
      missing.push(`세팅 '${entry.name}': 코드를 읽을 수 없음`)
      continue
    }
    const build = linkTalisman(decoded.build, customTalismans)
    const key = buildKey(db, entry.name, build, customTalismans)
    if (seen.has(key)) {
      skippedBuilds++
      continue
    }
    seen.add(key)
    if (decoded.missing.length > 0) missing.push(`세팅 '${entry.name}': ${decoded.missing.join(', ')}`)
    savedBuilds.push({
      id: createId(),
      name: entry.name,
      memo: entry.memo,
      build,
      ...weaponKindField(entry.weaponKind),
      ...tagsField(entry.tags),
      ...favoriteField(entry.favorite),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    })
    addedBuilds++
  }

  // 3) 리롤 기록: 같은 무기·속성·번째의 기록이 있으면 건너뜀 (지금 있는 것은 그대로)
  const gogmaRolls = [...(current.gogmaRolls ?? [])]
  let addedGogmaRolls = 0
  let skippedGogmaRolls = 0
  let unreadable = 0
  for (const entry of file.gogmaRolls) {
    const restored = fromBackupRoll(entry, skillIds(db))
    if (!restored) {
      unreadable++
      continue
    }
    const { roll, dropped } = restored
    if (gogmaRolls.some((r) => r.id === roll.id)) {
      skippedGogmaRolls++
      continue
    }
    if (dropped > 0) missing.push(`리롤 기록 '${weaponLabel(roll)} ${roll.step}번째': 스킬 ${dropped}개`)
    gogmaRolls.push(roll)
    addedGogmaRolls++
  }
  const gogmaRestores = [...(current.gogmaRestores ?? [])]
  let addedGogmaRestores = 0
  let skippedGogmaRestores = 0
  for (const entry of file.gogmaRestores) {
    const roll = fromBackupBase(entry)
    if (!roll) unreadable++
    else if (gogmaRestores.some((r) => r.id === roll.id)) skippedGogmaRestores++
    else {
      gogmaRestores.push(roll)
      addedGogmaRestores++
    }
  }
  if (unreadable > 0) missing.push(`리롤 기록 ${unreadable}개: 읽을 수 없음`)
  gogmaRolls.sort(compareEntries)
  gogmaRestores.sort(compareEntries)

  // 진행 횟수는 이 기기에서 아직 진행하지 않은 쪽만 가져온다 (진행 중인 것을 덮지 않게)
  const mine = current.gogmaProgress ?? { skill: 0, restore: 0 }
  const theirs = file.gogmaProgress
  const progress = theirs && {
    skill: mine.skill === 0 ? theirs.skill : mine.skill,
    restore: mine.restore === 0 ? theirs.restore : mine.restore,
  }
  const gogmaProgress = progress && (progress.skill !== mine.skill || progress.restore !== mine.restore) ? progress : null

  const { exportedAt } = file
  return {
    savedBuilds,
    customTalismans,
    addedBuilds,
    addedTalismans,
    skippedBuilds,
    gogmaRolls,
    addedGogmaRolls,
    skippedGogmaRolls,
    gogmaRestores,
    addedGogmaRestores,
    skippedGogmaRestores,
    gogmaProgress,
    missing,
    exportedAt,
  }
}

function buildKey(db: GameDb, name: string, build: BuildState, talismans: readonly CustomTalisman[]): string {
  return `${name}\u0000${encodeBuild(db, build, talismans, name)}`
}

// ---- 파일 형식 검사 ----

interface ParsedTalisman {
  name: string
  rarity: number | null
  skills: SkillPoint[]
  slots: Slot[]
  skillGameIds: (number | null)[] | null
}

interface ParsedBuild {
  name: string
  memo: string
  weaponKind: WeaponKind | null
  tags: string[]
  favorite: boolean
  createdAt: string
  updatedAt: string
  code: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

function parseBackup(input: unknown): {
  talismans: ParsedTalisman[]
  builds: ParsedBuild[]
  gogmaRolls: unknown[]
  gogmaRestores: unknown[]
  gogmaProgress: RerollProgress | null
  exportedAt: string | null
} {
  if (!isRecord(input) || input.app !== 'mhwilds-sim' || input.kind !== 'backup') {
    throw new ShareCodeError(INVALID_BACKUP)
  }
  if (input.version !== 1) throw new ShareCodeError('지원하지 않는 백업 버전이에요')
  if (!Array.isArray(input.talismans) || !Array.isArray(input.builds)) throw new ShareCodeError(INVALID_BACKUP)
  return {
    talismans: input.talismans.map(parseTalisman),
    builds: input.builds.map(parseBuild),
    // 리롤 기록은 나중에 더한 값이라 없을 수 있다 (기록마다 fromBackupRoll 이 검사)
    gogmaRolls: Array.isArray(input.gogmaRolls) ? input.gogmaRolls : [],
    gogmaRestores: Array.isArray(input.gogmaRestores) ? input.gogmaRestores : [],
    gogmaProgress: readProgress(input.gogmaProgress),
    exportedAt: typeof input.exportedAt === 'string' ? input.exportedAt : null,
  }
}

function parseTalisman(value: unknown): ParsedTalisman {
  if (!isRecord(value) || !Array.isArray(value.skills) || !Array.isArray(value.slots)) {
    throw new ShareCodeError(INVALID_BACKUP)
  }
  const skills = value.skills.map((p): SkillPoint => {
    if (!isRecord(p) || !isInt(p.skillId) || !isInt(p.level) || p.level < 1) throw new ShareCodeError(INVALID_BACKUP)
    return { skillId: p.skillId, level: p.level }
  })
  const slots = value.slots.map((s): Slot => {
    if (!isRecord(s) || (s.kind !== 'armor' && s.kind !== 'weapon') || !(s.level === 1 || s.level === 2 || s.level === 3)) {
      throw new ShareCodeError(INVALID_BACKUP)
    }
    return { kind: s.kind, level: s.level as SlotLevel }
  })
  const gameIds = value.skillGameIds
  return {
    name: typeof value.name === 'string' ? value.name : '',
    rarity: isInt(value.rarity) && value.rarity > 0 ? value.rarity : null,
    skills,
    slots,
    skillGameIds:
      Array.isArray(gameIds) && gameIds.length === skills.length ? gameIds.map((g) => (isInt(g) ? g : null)) : null,
  }
}

function parseBuild(value: unknown): ParsedBuild {
  if (!isRecord(value) || typeof value.code !== 'string') throw new ShareCodeError(INVALID_BACKUP)
  const now = new Date().toISOString()
  const text = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback)
  const name = text(value.name, '').trim()
  return {
    name: name || '이름 없는 세팅',
    memo: text(value.memo, ''),
    // 모르는 무기 종류는 미지정으로 (세팅은 그대로 가져온다)
    weaponKind: isWeaponKind(value.weaponKind) ? value.weaponKind : null,
    // 글자가 아닌 태그는 빼고 다듬는다 (세팅은 그대로 가져온다)
    tags: readTags(value.tags),
    favorite: value.favorite === true,
    createdAt: text(value.createdAt, now),
    updatedAt: text(value.updatedAt, now),
    code: value.code,
  }
}

/** 게임 내부 id 가 있으면 그것으로, 없으면 저장된 스킬 id 로 스킬을 찾는다 */
function restoreTalisman(db: GameDb, entry: ParsedTalisman): { draft: TalismanDraft; dropped: number } {
  const skills: SkillPoint[] = []
  let dropped = 0
  entry.skills.forEach((p, i) => {
    const gameId = entry.skillGameIds?.[i]
    const skill = gameId !== undefined && gameId !== null ? db.skillByGameId(gameId) : db.skills.get(p.skillId)
    if (skill) skills.push({ skillId: skill.id, level: p.level })
    else dropped++
  })
  return { draft: { name: entry.name, rarity: entry.rarity, skills, slots: entry.slots }, dropped }
}
