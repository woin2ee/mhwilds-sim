// 거극 아티어 리롤 루트 (DESIGN.md §7.6). 순수 TS — 화면·저장·동기화·백업이 함께 쓴다.
// 스킬 재부여와 거극 복원 강화가 같은 방식이라 기록·루트·진행을 함께 다룬다.
// 복원 강화는 몇 번째에 잘 떴는지와 그게 '초기화'인지 '재부여(수치만 변경)'인지만 적는다
// (어떤 보너스가 붙었는지는 사용자가 필요 없다고 함, 2026-11-15).
//
// 게임 규칙 (커뮤니티 실험·사용자 확인, 공식 발표 없음 — 다르면 이 파일만 고친다):
// - 리롤 결과는 세이브마다 정해져 있다. 리롤 횟수는 무기와 상관없이 하나로 이어지고, n번째에 무엇이 나오는지는
//   무기 종류 × 속성마다 다르다. 스킬 재부여와 복원 강화는 횟수를
//   따로 센다(복원 강화의 초기화와 재부여(수치만 변경)는 하나로 이어진다, 사용자 확인 2026-11-15). 저장하지 않고 나가면 저장한 위치로 돌아간다.
//   출처: 디시인사이드 몬헌 갤러리 '거극 아티어 테이블 관련 정보 정리'(2025-12), 나무위키 '아티어 무기' 리세마라 문단 (2026-11 확인)
// - 무기를 처음 거극 아티어로 격화할 때 붙는 스킬도 스킬 재부여 횟수에 들어간다 (한 번으로 센다, 사용자 확인 2026-11-15).
//   그래서 아직 격화하지 않은 무기는 루트의 제 차례에 격화하면 재부여 없이 그 번째의 스킬을 받는다.
// - 그래서 저장한 위치에서 무기·속성마다 여러 번 돌려 보고 잘 뜬 번째만 적어 두면, 번째 순서대로 그 무기를 리롤하고
//   사이 번째는 다른 무기로 넘겨 원하는 결과를 모두 띄울 수 있다. 리롤 한 번마다 재료가 들므로 마지막 번째가 곧 총 횟수다.
import { WEAPON_KIND_LABEL } from '../data/labels'
import { WEAPON_KINDS, type WeaponKind } from '../data/types'

/** 거극 아티어 무기의 속성. 상태 이상도 속성으로 치고, 'none' 은 무속성 */
export const GOGMA_ELEMENTS = [
  'fire',
  'water',
  'thunder',
  'ice',
  'dragon',
  'poison',
  'paralysis',
  'sleep',
  'blast',
  'none',
] as const
export type GogmaElement = (typeof GOGMA_ELEMENTS)[number]

export const GOGMA_ELEMENT_LABEL: Record<GogmaElement, string> = {
  fire: '불',
  water: '물',
  thunder: '번개',
  ice: '얼음',
  dragon: '용',
  poison: '독',
  paralysis: '마비',
  sleep: '수면',
  blast: '폭파',
  none: '무속성',
}

/** 저장한 위치에서 셀 수 있는 가장 큰 번째 */
export const MAX_STEP = 999

/** 리롤 결과를 함께 쓰는 무기 (무기 종류 × 속성) */
export interface GogmaWeapon {
  weaponKind: WeaponKind
  element: GogmaElement
}

/**
 * 잘 뜬 리롤 하나의 공통 부분: 저장한 위치에서 step 번째로 이 무기를 리롤하면 나오는 결과.
 * 같은 무기의 같은 번째는 결과가 하나뿐이라 id 를 `${weaponKind}:${element}:${step}` 으로 정해 두어
 * 다시 적으면 바꾸고, 두 기기·백업에서 따로 적은 같은 칸이 하나로 합쳐진다
 */
export interface RerollEntry extends GogmaWeapon {
  id: string
  step: number
  /** 루트에서 뺌 (기록은 남김) */
  excluded?: true
  /** 진행하며 이 칸으로 이 무기를 띄움 (이 무기는 루트에서 끝난 것) */
  done?: true
  /** 아직 격화하지 않은 무기 (스킬 재부여만, 무기마다 같은 값, 루트에서 재부여 대신 격화) */
  beforeGogma?: true
}

/** 잘 뜬 스킬 재부여 */
export interface GogmaRoll extends RerollEntry {
  setSkillId: number | null
  groupSkillId: number | null
}

export const weaponKey = (w: GogmaWeapon): string => `${w.weaponKind}:${w.element}`
export const rollId = (w: GogmaWeapon, step: number): string => `${weaponKey(w)}:${step}`

/** 예: 불 태도 */
export const weaponLabel = (w: GogmaWeapon): string => `${GOGMA_ELEMENT_LABEL[w.element]} ${WEAPON_KIND_LABEL[w.weaponKind]}`

export const isValidStep = (step: number): boolean => Number.isInteger(step) && step >= 1 && step <= MAX_STEP

/** 무기 종류 순, 같은 무기 종류는 속성 순 */
export function compareWeapons(a: GogmaWeapon, b: GogmaWeapon): number {
  return (
    WEAPON_KINDS.indexOf(a.weaponKind) - WEAPON_KINDS.indexOf(b.weaponKind) ||
    GOGMA_ELEMENTS.indexOf(a.element) - GOGMA_ELEMENTS.indexOf(b.element)
  )
}

/** 기록 목록 정렬: 무기 순, 같은 무기는 번째 순 */
export const compareEntries = (a: RerollEntry, b: RerollEntry): number => compareWeapons(a, b) || a.step - b.step

/**
 * 기록을 더한(같은 무기·번째면 바꾼) 목록. 루트에서 뺀 표시는 지우고, 진행 완료 표시는 같은 칸을 고칠 때만 남기며,
 * 격화 전 표시는 그 무기의 다른 기록을 따른다
 */
export function putEntry<T extends RerollEntry>(list: readonly T[], entry: Omit<T, 'id' | 'excluded' | 'done' | 'beforeGogma'>): T[] {
  const id = rollId(entry, entry.step)
  const key = weaponKey(entry)
  const before = list.some((r) => weaponKey(r) === key && r.beforeGogma)
  const done = list.some((r) => r.id === id && r.done)
  const next = {
    ...entry,
    id,
    ...(done ? { done: true as const } : {}),
    ...(before ? { beforeGogma: true as const } : {}),
  } as T
  return [...list.filter((r) => r.id !== id), next].sort(compareEntries)
}

/** 스킬 재부여 기록 더하기 (키 순서를 늘 같게) */
export function putRoll(list: readonly GogmaRoll[], roll: Omit<GogmaRoll, 'id' | 'excluded' | 'done' | 'beforeGogma'>): GogmaRoll[] {
  return putEntry<GogmaRoll>(list, {
    weaponKind: roll.weaponKind,
    element: roll.element,
    step: roll.step,
    setSkillId: roll.setSkillId,
    groupSkillId: roll.groupSkillId,
  })
}

function withFlag<T extends RerollEntry>(entry: T, flag: 'excluded' | 'done' | 'beforeGogma', on: boolean): T {
  const { [flag]: _, ...rest } = entry
  return (on ? { ...rest, [flag]: true } : rest) as T
}

export function setExcluded<T extends RerollEntry>(list: readonly T[], id: string, excluded: boolean): T[] {
  return list.map((r) => (r.id === id ? withFlag(r, 'excluded', excluded) : r))
}

/** 무기를 격화 전으로 표시하거나 지운다 (그 무기의 기록 모두) */
export function setBeforeGogma<T extends RerollEntry>(list: readonly T[], weapon: GogmaWeapon, before: boolean): T[] {
  const key = weaponKey(weapon)
  return list.map((r) => (weaponKey(r) === key ? withFlag(r, 'beforeGogma', before) : r))
}

/**
 * 잘 뜬 복원 강화: 번째와 어느 쪽으로 떴는지. valuesOnly 면 '재부여(수치만 변경)', 없으면 '초기화'.
 * 둘은 리롤 횟수 하나로 이어서 센다 (사용자 확인 2026-11-15) — 그래서 한 표·한 루트에 함께 둔다
 */
export interface RestoreRoll extends RerollEntry {
  valuesOnly?: true
}

/** 루트·칸에 보이는 복원 강화 종류 */
export const restoreAction = (r: Pick<RestoreRoll, 'valuesOnly'>): string => (r.valuesOnly ? '수치 재부여' : '초기화')

/** 복원 강화 기록 더하기 (같은 칸이면 종류를 바꾼다, 키 순서를 늘 같게) */
export const putRestore = (
  list: readonly RestoreRoll[],
  weapon: GogmaWeapon,
  step: number,
  valuesOnly = false,
): RestoreRoll[] =>
  putEntry<RestoreRoll>(list, {
    weaponKind: weapon.weaponKind,
    element: weapon.element,
    step,
    ...(valuesOnly ? { valuesOnly: true as const } : {}),
  })

/**
 * 끝난 기록: 진행하며 띄운 무기의 기록 모두(그 무기는 이미 원하는 결과를 받았다)와 이미 지나간 번째의 기록.
 * 루트를 따라 수십 번 이어서 돌리는 동안 쓸모없어진 기록을 지울 때 쓴다
 */
export function finishedEntries<T extends RerollEntry>(list: readonly T[], progress: number): T[] {
  const doneKeys = new Set(list.filter((r) => r.done).map(weaponKey))
  return list.filter((r) => r.step <= progress || doneKeys.has(weaponKey(r)))
}

/** 무기별로 묶은 기록 (무기 순, 안은 번째 순) */
export function groupByWeapon<T extends RerollEntry>(list: readonly T[]): { weapon: GogmaWeapon; entries: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const r of [...list].sort(compareEntries)) {
    const key = weaponKey(r)
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return [...groups.values()].map((entries) => ({
    weapon: { weaponKind: entries[0].weaponKind, element: entries[0].element },
    entries,
  }))
}

/** 기록에 많이 나온 스킬 (많은 순, 같으면 먼저 나온 순). 입력할 때 한 번에 고르는 단추에 쓴다 */
export function frequentSkills(list: readonly GogmaRoll[], field: 'setSkillId' | 'groupSkillId', limit = 8): number[] {
  const counts = new Map<number, number>()
  for (const r of list) {
    const id = r[field]
    if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)
}

// ---- 루트 ----

export interface RerollRoute<T extends RerollEntry> {
  /** 번째 순서대로 리롤할 기록 (무기마다 하나). 진행하며 띄운 칸(done)도 들어 있다 */
  stops: T[]
  /** 마지막 번째 = 총 리롤 횟수 (격화 포함, 없으면 0) */
  total: number
  /** 그중 격화로 받는 번째 수 (격화 전 무기의 차례). 재부여 재료가 드는 횟수는 total - conversions */
  conversions: number
  /** 다른 무기와 같은 번째에만 잘 떠서(또는 남은 번째가 이미 지나서) 함께 넣지 못한 무기 */
  left: GogmaWeapon[]
}

/**
 * 가장 짧은 루트. progress 는 저장한 위치에서 이미 한 리롤 수다.
 * - 진행하며 띄운 칸(done)이 있는 무기는 끝난 것으로 그 칸을 그대로 둔다.
 * - 남은 무기는 progress 다음 번째의 기록 중에서(루트에서 뺀 기록 빼고) 하나씩, 한 번째에 한 무기만 리롤하도록 번째가 겹치지 않게
 *   골라 마지막 번째(총 횟수)를 가장 작게 한다. 모든 무기를 넣을 수 없으면 가장 많이 넣는 것을 먼저 따진다.
 * 무기 수·기록 수가 작아(수십) 이분 매칭을 기준 번째마다 다시 해도 충분히 빠르다.
 */
export function bestRoute<T extends RerollEntry>(list: readonly T[], progress = 0): RerollRoute<T> {
  const done = list.filter((r) => r.done)
  const doneKeys = new Set(done.map(weaponKey))
  const used = new Set(done.map((r) => r.step))
  const allGroups = groupByWeapon(list.filter((r) => !r.excluded && !doneKeys.has(weaponKey(r))))
  const groups = allGroups.map((g) => ({
    weapon: g.weapon,
    entries: g.entries.filter((r) => r.step > progress && !used.has(r.step)),
  }))

  const match = (limit: number) => {
    // 번째 → 그 번째를 쓰는 무기 순번
    const owner = new Map<number, number>()
    const tryAssign = (w: number, seen: Set<number>): boolean => {
      for (const r of groups[w].entries) {
        if (r.step > limit || seen.has(r.step)) continue
        seen.add(r.step)
        const other = owner.get(r.step)
        if (other === undefined || tryAssign(other, seen)) {
          owner.set(r.step, w)
          return true
        }
      }
      return false
    }
    let size = 0
    groups.forEach((_, w) => {
      if (tryAssign(w, new Set())) size++
    })
    return { size, owner }
  }

  let best = match(Infinity)
  const most = best.size
  const steps = [...new Set(groups.flatMap((g) => g.entries.map((r) => r.step)))].sort((a, b) => a - b)
  for (const limit of steps) {
    const m = match(limit)
    if (m.size === most) {
      best = m
      break
    }
  }

  const planned = [...best.owner.entries()].map(([step, w]) => groups[w].entries.find((r) => r.step === step)!)
  const stops = [...done, ...planned].sort((a, b) => a.step - b.step)
  const placed = new Set(best.owner.values())
  return {
    stops,
    total: stops.length > 0 ? stops[stops.length - 1].step : 0,
    conversions: stops.filter((r) => r.beforeGogma).length,
    left: groups.filter((_, w) => !placed.has(w)).map((g) => g.weapon),
  }
}

// ---- 진행 ----

/**
 * 한 번 리롤했어요: 진행을 하나 늘리고, 지금 루트에서 그 번째가 어느 무기의 차례였으면 그 칸을 띄운 것으로 표시한다.
 * (루트는 진행 다음 번째만 쓰므로 미리 표시해 두지 않으면 지난 차례가 루트에서 사라진다)
 */
export function stepForward<T extends RerollEntry>(list: readonly T[], progress: number): { list: T[]; progress: number } {
  const next = progress + 1
  const stop = bestRoute(list, progress).stops.find((r) => r.step === next && !r.done)
  return { list: stop ? list.map((r) => (r.id === stop.id ? withFlag(r, 'done', true) : r)) : [...list], progress: next }
}

/** 한 번 되돌리기: 진행을 하나 줄이고, 그 번째에 띄운 칸의 완료 표시를 지운다 */
export function stepBack<T extends RerollEntry>(list: readonly T[], progress: number): { list: T[]; progress: number } {
  if (progress <= 0) return { list: [...list], progress: 0 }
  return { list: list.map((r) => (r.done && r.step === progress ? withFlag(r, 'done', false) : r)), progress: progress - 1 }
}

/** 진행한 리롤 수 (스킬 재부여·복원 강화 따로) */
export interface RerollProgress {
  skill: number
  restore: number
}

export const NO_PROGRESS: RerollProgress = { skill: 0, restore: 0 }

// ---- 돌려 본 번째 ----

/**
 * 무기마다 저장한 위치에서 몇 번째까지 돌려 봤는지 (키는 weaponKey). 그 안에서 적지 않은 칸은 안 뜬 칸이라
 * 다음에 같은 무기를 또 돌려 볼 때 그 뒤부터 보면 된다 (사용자 요청 2026-11-15)
 */
export type CheckedSteps = Record<string, number>

/** 스킬 재부여·복원 강화 따로 */
export interface RerollChecked {
  skill: CheckedSteps
  restore: CheckedSteps
}

export const NO_CHECKED: RerollChecked = { skill: {}, restore: {} }

/** 이 무기를 step 번째까지 돌려 봄 (0 이면 지움) */
export function setChecked(map: CheckedSteps, weapon: GogmaWeapon, step: number): CheckedSteps {
  const { [weaponKey(weapon)]: _, ...rest } = map
  return step > 0 ? { ...rest, [weaponKey(weapon)]: step } : rest
}

export const hasChecked = (c: RerollChecked): boolean => Object.keys(c.skill).length + Object.keys(c.restore).length > 0

/** 백업에서 가져올 때: 무기마다 더 뒤까지 본 쪽 */
export function mergeChecked(a: RerollChecked, b: RerollChecked): RerollChecked {
  const merge = (x: CheckedSteps, y: CheckedSteps) => {
    const out = { ...x }
    for (const [key, n] of Object.entries(y)) out[key] = Math.max(out[key] ?? 0, n)
    return out
  }
  return { skill: merge(a.skill, b.skill), restore: merge(a.restore, b.restore) }
}

// ---- 저장값 검사 ----

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNullableInt = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isInteger(v))
const isWeaponKind = (v: unknown): v is WeaponKind => typeof v === 'string' && (WEAPON_KINDS as readonly string[]).includes(v)
const isFlag = (v: unknown) => v === undefined || v === true
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_STEP

export const isGogmaElement = (v: unknown): v is GogmaElement =>
  typeof v === 'string' && (GOGMA_ELEMENTS as readonly string[]).includes(v)

/** 기록의 공통 부분 검사 */
export function isEntryBase(v: unknown): v is RerollEntry {
  return (
    isRecord(v) &&
    isWeaponKind(v.weaponKind) &&
    isGogmaElement(v.element) &&
    typeof v.step === 'number' &&
    isValidStep(v.step) &&
    v.id === rollId({ weaponKind: v.weaponKind, element: v.element }, v.step) &&
    isFlag(v.excluded) &&
    isFlag(v.done) &&
    isFlag(v.beforeGogma)
  )
}

export const isGogmaRoll = (v: unknown): v is GogmaRoll =>
  isEntryBase(v) && isNullableInt((v as GogmaRoll).setSkillId) && isNullableInt((v as GogmaRoll).groupSkillId)

export const isGogmaRollList = (v: unknown): v is GogmaRoll[] => Array.isArray(v) && v.every(isGogmaRoll)

export const isRestoreRoll = (v: unknown): v is RestoreRoll => isEntryBase(v) && isFlag((v as RestoreRoll).valuesOnly)
export const isRestoreRollList = (v: unknown): v is RestoreRoll[] => Array.isArray(v) && v.every(isRestoreRoll)

export const isRerollProgress = (v: unknown): v is RerollProgress => isRecord(v) && isCount(v.skill) && isCount(v.restore)

const isWeaponKeyString = (k: string) => {
  const [kind, element, rest] = k.split(':')
  return rest === undefined && isWeaponKind(kind) && isGogmaElement(element)
}
const isCheckedSteps = (v: unknown): v is CheckedSteps =>
  isRecord(v) && Object.entries(v).every(([k, n]) => isWeaponKeyString(k) && isCount(n) && n > 0)

export const isRerollChecked = (v: unknown): v is RerollChecked =>
  isRecord(v) && isCheckedSteps(v.skill) && isCheckedSteps(v.restore)

/** 백업 등에서 읽은 돌려 본 번째 (모양이 틀리면 null) */
export function readChecked(v: unknown): RerollChecked | null {
  return isRerollChecked(v) ? { skill: { ...v.skill }, restore: { ...v.restore } } : null
}

/** 백업 등에서 읽은 진행 (모양이 틀리면 null) */
export function readProgress(v: unknown): RerollProgress | null {
  return isRerollProgress(v) ? { skill: v.skill, restore: v.restore } : null
}

// ---- 백업 ----

/** 백업 기록의 공통 부분 (게임 데이터와 무관한 값이라 그대로) */
export interface BackupEntryBase extends GogmaWeapon {
  step: number
  excluded?: true
  done?: true
  beforeGogma?: true
}

/** 백업에 담는 스킬 재부여 기록. 스킬은 데이터를 다시 만들어도 바뀌지 않는 게임 내부 id 로 담는다 (내 호석 백업과 같음) */
export interface BackupGogmaRoll extends BackupEntryBase {
  set: number | null
  group: number | null
}

/** 백업에 담는 복원 강화 기록 */
export interface BackupRestoreRoll extends BackupEntryBase {
  valuesOnly?: true
}

export interface SkillIdMap {
  toGameId: (skillId: number) => number | undefined
  fromGameId: (gameId: number) => number | undefined
}

export function toBackupBase(entry: RerollEntry): BackupEntryBase {
  return {
    weaponKind: entry.weaponKind,
    element: entry.element,
    step: entry.step,
    ...(entry.excluded ? { excluded: true as const } : {}),
    ...(entry.done ? { done: true as const } : {}),
    ...(entry.beforeGogma ? { beforeGogma: true as const } : {}),
  }
}

/** 백업 기록의 공통 부분. 모양이 틀리면 null */
export function fromBackupBase(value: unknown): RerollEntry | null {
  if (!isRecord(value) || !isWeaponKind(value.weaponKind) || !isGogmaElement(value.element)) return null
  if (typeof value.step !== 'number' || !isValidStep(value.step)) return null
  const weapon = { weaponKind: value.weaponKind, element: value.element }
  return {
    id: rollId(weapon, value.step),
    ...weapon,
    step: value.step,
    ...(value.excluded === true ? { excluded: true as const } : {}),
    ...(value.done === true ? { done: true as const } : {}),
    ...(value.beforeGogma === true ? { beforeGogma: true as const } : {}),
  }
}

export function toBackupRestore(roll: RestoreRoll): BackupRestoreRoll {
  return { ...toBackupBase(roll), ...(roll.valuesOnly ? { valuesOnly: true as const } : {}) }
}

/** 백업의 복원 강화 기록 하나. 모양이 틀리면 null */
export function fromBackupRestore(value: unknown): RestoreRoll | null {
  const base = fromBackupBase(value)
  if (!base || !isRecord(value)) return null
  return { ...base, ...(value.valuesOnly === true ? { valuesOnly: true as const } : {}) }
}

export function toBackupRoll(roll: GogmaRoll, ids: SkillIdMap): BackupGogmaRoll {
  const gameId = (id: number | null) => (id === null ? null : (ids.toGameId(id) ?? null))
  const { weaponKind, element, step, ...flags } = toBackupBase(roll)
  return { weaponKind, element, step, set: gameId(roll.setSkillId), group: gameId(roll.groupSkillId), ...flags }
}

/** 백업의 스킬 재부여 기록 하나. 모양이 틀리면 null, 지금 데이터에 없는 스킬은 비우고 그 수를 dropped 로 */
export function fromBackupRoll(value: unknown, ids: SkillIdMap): { roll: GogmaRoll; dropped: number } | null {
  const base = fromBackupBase(value)
  if (!base || !isRecord(value)) return null
  let dropped = 0
  const skillId = (gameId: unknown) => {
    if (gameId === null || gameId === undefined) return null
    const id = typeof gameId === 'number' ? ids.fromGameId(gameId) : undefined
    if (id === undefined) dropped++
    return id ?? null
  }
  const { id, weaponKind, element, step, ...flags } = base
  return {
    roll: { id, weaponKind, element, step, setSkillId: skillId(value.set), groupSkillId: skillId(value.group), ...flags },
    dropped,
  }
}
