// 기기끼리 맞추는 저장값과 병합 규칙 (DESIGN.md §8.5). 순수 함수라 화면 없이 테스트한다.
import { detachTalisman, linkTalisman, sameTalisman } from '../../core/buildUpdates'
import type { SavedBuild } from '../../core/savedBuilds'
import { canonicalJson, merge3, mergeList, sameJson, type Side } from '../../core/sync/merge'
import type { BuildState, CustomTalisman, TalismanRef } from '../../core/types'
import {
  isBuildState,
  isNullableString,
  isObject,
  isSavedBuild,
  isTalisman,
  STORAGE_KEYS as K,
} from '../../state/storedValues'
import { isStoredConditions, type SearchConditions } from '../search/conditions'
import { conditionsKey, validPresets, type SearchPreset } from '../search/presets'

/** 기기끼리 맞추는 저장값. 화면 설정(테마·탭·접은 패널 등)은 기기마다 따로 둔다 */
export const SYNC_KEYS = [
  K.talismans,
  K.savedBuilds,
  K.searchPresets,
  K.searchConditions,
  K.searchPresetActive,
  K.manualBuild,
  K.manualSource,
] as const

export type SyncKey = (typeof SYNC_KEYS)[number]
/** 키 → 저장값 (없으면 저장값 없음) */
export type SyncValues = Partial<Record<SyncKey, unknown>>

export const SYNC_FILE_VERSION = 1

/** 드라이브에 올리는 파일 (앱 전용 숨김 폴더의 JSON 하나) */
export interface SyncFile {
  app: 'mhwilds-sim'
  kind: 'sync'
  version: number
  /** 마지막으로 올린 시각 (ISO) */
  savedAt: string
  /** localStorage 키 → 저장값. 이 버전이 모르는 키(새 버전이 더한 값)도 지우지 않고 그대로 올린다 */
  values: Record<string, unknown>
  /** 키마다 마지막으로 바뀐 시각. 두 기기가 함께 바꾼 값 중 나중 것을 고를 때 쓴다 */
  changedAt: Record<string, string>
}

export type ParsedSyncFile = { file: SyncFile } | { newer: true } | { invalid: true }

/** 드라이브에서 읽은 JSON. 더 새 버전이 쓴 파일이면 newer (덮어쓰지 않게), 모양이 틀리면 invalid */
export function parseSyncFile(value: unknown): ParsedSyncFile {
  if (!isObject(value) || value.app !== 'mhwilds-sim' || value.kind !== 'sync') return { invalid: true }
  const { version } = value
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { invalid: true }
  if (version > SYNC_FILE_VERSION) return { newer: true }
  const changedAt: Record<string, string> = {}
  if (isObject(value.changedAt)) {
    for (const [key, at] of Object.entries(value.changedAt)) if (typeof at === 'string') changedAt[key] = at
  }
  return {
    file: {
      app: 'mhwilds-sim',
      kind: 'sync',
      version,
      savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
      values: isObject(value.values) ? value.values : {},
      changedAt,
    },
  }
}

export interface ListChange {
  added: number
  removed: number
  changed: number
}

/** 동기화로 이 기기에서 바뀌는 것 (알림용) */
export interface SyncSummary {
  builds: ListChange
  talismans: ListChange
  presets: ListChange
  /** 지금 검색 조건(불러온 저장한 조건 포함)이 바뀜 */
  conditions: boolean
  /** 수동 세팅이 바뀜 */
  manual: boolean
}

export interface MergeInput {
  /** 이 기기 저장값 */
  local: SyncValues
  /**
   * 마지막 동기화 뒤 이 기기에서 바꾼 키. 안 바꾼 키는 저장값이 그때와 달라도(깨져서 기본값이 됐을 때 등)
   * 그때 값으로 본다 — 바꾸지 않은 값이 '지운 것'으로 다른 기기까지 퍼지지 않게
   */
  localChanged: ReadonlySet<SyncKey>
  /** 키마다 이 기기에서 마지막으로 바꾼 시각 (ISO) */
  localChangedAt: Partial<Record<SyncKey, string>>
  /** 마지막 동기화 때 값. 없으면 처음 동기화라 양쪽을 합치기만 하고 지우지 않는다 */
  base: SyncValues | null
  /** 드라이브 파일 (없으면 null) */
  remote: SyncFile | null
  now: string
}

export interface MergeOutput {
  /** 합친 값 (다음 동기화의 base) */
  values: SyncValues
  /** 이 기기에 쓸 값 (지금 저장값과 다른 키만) */
  localUpdates: SyncValues
  /** 드라이브에 올릴 파일 (드라이브와 같으면 null) */
  upload: SyncFile | null
  summary: SyncSummary
}

/** 형식을 검사한 저장값. 목록은 형식이 맞는 항목만 남긴다 (하나가 깨져도 나머지는 살린다) */
interface Data {
  talismans?: CustomTalisman[]
  builds?: SavedBuild[]
  presets?: SearchPreset[]
  conditions?: Partial<SearchConditions>
  activePreset?: string | null
  manual?: BuildState
  manualSource?: string | null
}

const FIELD_KEYS: Record<keyof Data, SyncKey> = {
  talismans: K.talismans,
  builds: K.savedBuilds,
  presets: K.searchPresets,
  conditions: K.searchConditions,
  activePreset: K.searchPresetActive,
  manual: K.manualBuild,
  manualSource: K.manualSource,
}
const FIELDS = Object.keys(FIELD_KEYS) as (keyof Data)[]

/** 함께 고르는 값: 지금 조건과 불러온 저장한 조건, 수동 세팅과 불러온 내 세팅 */
const GROUPS: (keyof Data)[][] = [
  ['conditions', 'activePreset'],
  ['manual', 'manualSource'],
]

function toData(values: Partial<Record<string, unknown>>): Data {
  const list = <T>(value: unknown, valid: (item: unknown) => item is T) =>
    Array.isArray(value) ? value.filter(valid) : undefined
  const one = <T>(value: unknown, valid: (v: unknown) => v is T) => (valid(value) ? value : undefined)
  const presets = values[K.searchPresets]
  return {
    talismans: list(values[K.talismans], isTalisman),
    builds: list(values[K.savedBuilds], isSavedBuild),
    presets: Array.isArray(presets) ? validPresets(presets) : undefined,
    conditions: one(values[K.searchConditions], isStoredConditions),
    activePreset: one(values[K.searchPresetActive], isNullableString),
    manual: one(values[K.manualBuild], isBuildState),
    manualSource: one(values[K.manualSource], isNullableString),
  }
}

function toValues(data: Data): SyncValues {
  const values: SyncValues = {}
  for (const field of FIELDS) if (data[field] !== undefined) values[FIELD_KEYS[field]] = data[field]
  return values
}

export function mergeSync(input: MergeInput): MergeOutput {
  const original = toData(input.local)
  const base = input.base ? toData(input.base) : null
  const remote = input.remote ? toData(input.remote.values) : null

  // 마지막 동기화 뒤 이 기기에서 안 바꾼 값(과 없거나 깨진 값)은 그때 값으로 본다. 묶은 값은 하나라도 바꿨으면 함께 바꾼 것.
  // 그때 없던 값(새로 동기화하게 된 키 등)은 그대로 둔다
  let local: Data = { ...original }
  if (base) {
    const changed = (field: keyof Data) => {
      const group = GROUPS.find((g) => g.includes(field)) ?? [field]
      return group.some((f) => input.localChanged.has(FIELD_KEYS[f]))
    }
    for (const field of FIELDS) {
      if (base[field] !== undefined && (!changed(field) || local[field] === undefined)) {
        local = { ...local, [field]: base[field] }
      }
    }
  }

  // 처음 동기화: 예전에 백업 등으로 옮겨 양쪽에 따로 있는 같은 항목은 드라이브 것 하나로
  const first = !base && remote !== null
  if (first) local = dedupe(local, remote)

  const timeOf = (fields: (keyof Data)[], side: Side) =>
    fields.reduce((latest, field) => {
      const key = FIELD_KEYS[field]
      const at = (side === 'local' ? input.localChangedAt[key] : input.remote?.changedAt[key]) ?? ''
      return at > latest ? at : latest
    }, '')
  // 두 기기가 함께 바꿨으면 나중에 바꾼 쪽 (같으면 이 기기)
  const newer =
    (...fields: (keyof Data)[]) =>
    (): Side =>
      timeOf(fields, 'local') >= timeOf(fields, 'remote') ? 'local' : 'remote'
  // 내 세팅·저장한 조건은 항목마다 고친 시각이 있다
  const byUpdatedAt =
    (field: keyof Data) =>
    (l: { updatedAt: string }, r: { updatedAt: string }): Side =>
      l.updatedAt > r.updatedAt ? 'local' : l.updatedAt < r.updatedAt ? 'remote' : newer(field)()

  const list = <T extends { id: string }>(field: 'talismans' | 'builds' | 'presets', pick: (l: T, r: T) => Side) => {
    const b = base?.[field] as T[] | undefined
    const l = local[field] as T[] | undefined
    const r = remote?.[field] as T[] | undefined
    if (l === undefined && r === undefined) return b
    // 드라이브에 값이 없으면(처음 동기화 등) 바꾸지 않은 것으로 본다
    return mergeList(b, l ?? b ?? [], r ?? b ?? [], pick)
  }
  const talismans = list<CustomTalisman>('talismans', newer('talismans'))
  let builds = list<SavedBuild>('builds', byUpdatedAt('builds'))
  const presets = list<SearchPreset>('presets', byUpdatedAt('presets'))

  const merged: Data = { talismans, builds, presets }
  for (const group of GROUPS) {
    const values = mergeGroup(
      base && group.map((f) => base[f]),
      group.map((f) => local[f]),
      group.map((f) => remote?.[f]),
      newer(...group),
    )
    group.forEach((field, i) => Object.assign(merged, { [field]: values[i] }))
  }

  // 다른 기기에서 지운 내 호석을 가리키는 세팅은 같은 내용의 세팅 전용 호석으로 (그 기기에서 지울 때와 같게)
  if (talismans) {
    const ids = new Set(talismans.map((t) => t.id))
    const known = new Map<string, CustomTalisman>()
    for (const t of [...(base?.talismans ?? []), ...(remote?.talismans ?? []), ...(original.talismans ?? [])]) known.set(t.id, t)
    const detach = (build: BuildState) => {
      const choice = build.talisman
      const gone = choice?.type === 'custom' && !ids.has(choice.id) ? known.get(choice.id) : undefined
      return gone ? detachTalisman(build, gone) : build
    }
    builds = builds?.map((s) => {
      const build = detach(s.build)
      return build === s.build ? s : { ...s, build }
    })
    merged.builds = builds
    if (merged.manual) merged.manual = detach(merged.manual)
  }

  const values = toValues(merged)
  const localUpdates: SyncValues = {}
  for (const key of SYNC_KEYS) {
    if (values[key] !== undefined && !sameJson(values[key], input.local[key])) localUpdates[key] = values[key]
  }

  const remoteValues = input.remote?.values ?? {}
  const upload =
    !input.remote || SYNC_KEYS.some((key) => values[key] !== undefined && !sameJson(values[key], remoteValues[key]))
      ? syncFile(values, input)
      : null

  // 처음 동기화는 같은 항목을 드라이브 것으로 바꾼(id·호석 연결만 바뀐) 이 기기 값과 비교해 받은 것으로 세지 않는다
  const before = first ? local : original
  const summary: SyncSummary = {
    builds: listChange(before.builds, merged.builds),
    talismans: listChange(before.talismans, merged.talismans),
    presets: listChange(before.presets, merged.presets),
    conditions: !sameJson([before.conditions, before.activePreset], [merged.conditions, merged.activePreset]),
    manual: !sameJson([before.manual, before.manualSource], [merged.manual, merged.manualSource]),
  }
  return { values, localUpdates, upload, summary }
}

/** 묶은 값의 병합. 한쪽에 아예 없으면 다른 쪽, 고른 쪽에 빠진 값은 다른 쪽 것으로 채운다 */
function mergeGroup(
  base: unknown[] | null,
  local: unknown[],
  remote: unknown[],
  pick: () => Side,
): unknown[] {
  const absent = (values: unknown[]) => values.every((v) => v === undefined)
  if (absent(remote)) return local
  if (absent(local)) return remote
  const chosen = merge3(base && !absent(base) ? base : undefined, local, remote, pick) ?? local
  const other = chosen === local ? remote : local
  return chosen.map((v, i) => (v === undefined ? other[i] : v))
}

/** 올릴 파일. 바뀐 키는 이 기기에서 바꾼 시각(모르면 지금), 드라이브와 같은 키는 드라이브 시각을 둔다 */
function syncFile(values: SyncValues, input: MergeInput): SyncFile {
  const remote = input.remote
  const changedAt: Record<string, string> = { ...remote?.changedAt }
  for (const key of SYNC_KEYS) {
    if (values[key] === undefined) continue
    changedAt[key] = sameJson(values[key], remote?.values[key])
      ? (remote?.changedAt[key] ?? input.now)
      : (input.localChangedAt[key] ?? input.now)
  }
  return {
    app: 'mhwilds-sim',
    kind: 'sync',
    version: SYNC_FILE_VERSION,
    savedAt: input.now,
    values: { ...remote?.values, ...values },
    changedAt,
  }
}

function listChange<T extends { id: string }>(before: readonly T[] = [], after: readonly T[] = []): ListChange {
  const beforeById = new Map(before.map((item) => [item.id, item]))
  const afterIds = new Set(after.map((item) => item.id))
  return {
    added: after.filter((item) => !beforeById.has(item.id)).length,
    removed: before.filter((item) => !afterIds.has(item.id)).length,
    changed: after.filter((item) => beforeById.has(item.id) && !sameJson(beforeById.get(item.id), item)).length,
  }
}

/**
 * 처음 동기화할 때 이 기기에만 있는 항목 중 드라이브에만 있는 항목과 같은 것(예전에 백업으로 옮겨 id 만 다른 것)은
 * 그 자리에서 드라이브 것으로 바꾼다. 호석은 스킬·슬롯, 내 세팅은 이름·내용, 저장한 조건은 이름·조건이 같으면 같은 것
 * (백업·조건 가져오기의 건너뛰기 기준과 같음). 바꾼 호석·세팅·조건을 가리키던 값은 드라이브 것을 가리키게 옮긴다.
 */
function dedupe(local: Data, remote: Data): Data {
  const talismans = pairUp(local.talismans, remote.talismans, sameTalisman)
  const relink = (build: BuildState): BuildState => {
    const choice = build.talisman
    if (choice?.type !== 'custom') return build
    const target = talismans.pairs.get(choice.id)
    const mine = local.talismans?.find((t) => t.id === choice.id)
    // 같은 내용의 세팅 전용 호석으로 떼었다가 드라이브 호석에 다시 붙인다 (슬롯 순서가 다르면 장식주 위치를 맞춘다)
    return target && mine ? linkTalisman(detachTalisman(build, mine), [target]) : build
  }
  const relinkConditions = <C extends Partial<SearchConditions>>(cond: C): C => {
    const ref = cond.fixedTalisman
    const target = ref?.type === 'custom' ? talismans.pairs.get(ref.id) : undefined
    return target ? { ...cond, fixedTalisman: { type: 'custom', id: target.id } satisfies TalismanRef } : cond
  }

  const builds = local.builds?.map((s) => {
    const build = relink(s.build)
    return build === s.build ? s : { ...s, build }
  })
  const presets = local.presets?.map((p) => {
    const conditions = relinkConditions(p.conditions)
    return conditions === p.conditions ? p : { ...p, conditions }
  })

  const allTalismans = [...(talismans.list ?? []), ...(remote.talismans ?? [])]
  const buildKeys = new Map<SavedBuild, string>()
  const buildKey = (s: SavedBuild) => {
    let key = buildKeys.get(s)
    if (key === undefined) buildKeys.set(s, (key = `${s.name}\u0000${canonicalJson(linkTalisman(s.build, allTalismans))}`))
    return key
  }
  const sameBuilds = pairUp(builds, remote.builds, (a, b) => buildKey(a) === buildKey(b))
  const samePresets = pairUp(presets, remote.presets, (a, b) => a.name === b.name && conditionsKey(a.conditions) === conditionsKey(b.conditions))

  const moved = <T extends { id: string }>(id: string | null | undefined, pairs: Map<string, T>) =>
    (id && pairs.get(id)?.id) || id
  return {
    talismans: talismans.list,
    builds: sameBuilds.list,
    presets: samePresets.list,
    conditions: local.conditions && relinkConditions(local.conditions),
    activePreset: moved(local.activePreset, samePresets.pairs),
    manual: local.manual && relink(local.manual),
    manualSource: moved(local.manualSource, sameBuilds.pairs),
  }
}

/**
 * 이 기기에만 있는 항목 중 드라이브에만 있는 항목과 같은 것은 그 자리에서 드라이브 항목으로 바꾸고
 * 짝(이 기기 id → 드라이브 항목)을 남긴다. 하나씩 짝지어 같은 호석을 둘 가졌으면 둘 다 남는다
 */
function pairUp<T extends { id: string }>(
  local: T[] | undefined,
  remote: T[] | undefined,
  same: (a: T, b: T) => boolean,
): { list: T[] | undefined; pairs: Map<string, T> } {
  const pairs = new Map<string, T>()
  if (!local || !remote) return { list: local, pairs }
  const localIds = new Set(local.map((item) => item.id))
  const remoteIds = new Set(remote.map((item) => item.id))
  const candidates = remote.filter((item) => !localIds.has(item.id))
  const list = local.map((item) => {
    if (remoteIds.has(item.id)) return item
    const index = candidates.findIndex((other) => same(item, other))
    if (index < 0) return item
    const theirs = candidates[index]
    pairs.set(item.id, theirs)
    candidates.splice(index, 1)
    return theirs
  })
  return { list, pairs }
}

/** 알림 문구. 예: "내 세팅 2개 추가·1개 수정 · 검색 조건 바뀜" (바뀐 게 없으면 빈 문자열) */
export function summaryText(summary: SyncSummary): string {
  const parts: string[] = []
  const list = (label: string, change: ListChange) => {
    const counts = [
      change.added > 0 && `${change.added}개 추가`,
      change.removed > 0 && `${change.removed}개 삭제`,
      change.changed > 0 && `${change.changed}개 수정`,
    ].filter(Boolean)
    if (counts.length > 0) parts.push(`${label} ${counts.join('·')}`)
  }
  list('내 세팅', summary.builds)
  list('내 호석', summary.talismans)
  list('저장한 조건', summary.presets)
  if (summary.conditions) parts.push('검색 조건 바뀜')
  if (summary.manual) parts.push('수동 세팅 바뀜')
  return parts.join(' · ')
}
