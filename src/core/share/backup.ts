// 백업 만들기/가져오기 (DESIGN.md §8.3). 파일과 백업 코드가 같은 BackupFile 을 담는다.
import type { GameDb } from '../../data/db'
import type { SkillPoint, SlotLevel } from '../../data/types'
import { linkTalisman, sameTalisman } from '../buildUpdates'
import type { SavedBuild } from '../savedBuilds'
import type { BuildState, CustomTalisman, Slot, TalismanDraft } from '../types'
import { decodeBuild, encodeBuild } from './codec'
import { ShareCodeError, type BackupFile, type BackupImportResult } from './types'

const INVALID_BACKUP = '올바른 백업 파일이 아니에요'

/** 가져올 때 쓰지 않는 값(호석 id, 공유 코드 속 이름)은 빼서 백업 코드를 짧게 한다 */
export function createBackup(
  db: GameDb,
  savedBuilds: readonly SavedBuild[],
  customTalismans: readonly CustomTalisman[],
): BackupFile {
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
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      code: encodeBuild(db, s.build, customTalismans, null),
    })),
  }
}

/**
 * 백업(파일의 JSON.parse 결과나 decodeBackupCode 결과)을 현재 목록에 병합한다. 형식이 틀리면 ShareCodeError.
 * 상태를 바꾸지 않는 순수 함수라, 화면은 결과를 미리 보여 준 뒤 그대로 반영한다.
 */
export function importBackup(
  db: GameDb,
  input: unknown,
  current: { savedBuilds: readonly SavedBuild[]; customTalismans: readonly CustomTalisman[] },
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
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    })
    addedBuilds++
  }

  const { exportedAt } = file
  return { savedBuilds, customTalismans, addedBuilds, addedTalismans, skippedBuilds, missing, exportedAt }
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
  createdAt: string
  updatedAt: string
  code: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

function parseBackup(input: unknown): { talismans: ParsedTalisman[]; builds: ParsedBuild[]; exportedAt: string | null } {
  if (!isRecord(input) || input.app !== 'mhwilds-sim' || input.kind !== 'backup') {
    throw new ShareCodeError(INVALID_BACKUP)
  }
  if (input.version !== 1) throw new ShareCodeError('지원하지 않는 백업 버전이에요')
  if (!Array.isArray(input.talismans) || !Array.isArray(input.builds)) throw new ShareCodeError(INVALID_BACKUP)
  return {
    talismans: input.talismans.map(parseTalisman),
    builds: input.builds.map(parseBuild),
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
