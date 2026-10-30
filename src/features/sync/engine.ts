// 드라이브 파일과 이 기기 저장값을 한 번 맞춘다 (DESIGN.md §8.5). 드라이브·저장소를 주입받아 Node 테스트에서도 돈다.
import { mergeSync, parseSyncFile, SYNC_KEYS, type SyncFile, type SyncKey, type SyncSummary, type SyncValues } from './syncData'

/** 드라이브의 동기화 파일. version 은 드라이브가 올릴 때마다 키우는 파일 버전 */
export interface RemoteFile {
  id: string
  version: string
}

export interface DriveFiles {
  /** 동기화 파일 (없으면 null) */
  find(): Promise<RemoteFile | null>
  read(id: string): Promise<unknown>
  create(file: SyncFile): Promise<RemoteFile>
  update(id: string, file: SyncFile): Promise<RemoteFile>
  /** 지금 버전 (파일이 없어졌으면 null) */
  version(id: string): Promise<string | null>
}

export interface LocalStore {
  /** 지금 저장값 JSON (없으면 null) */
  readRaw(key: SyncKey): string | null
  /** 받은 값을 쓴다 (화면에도 반영하고, 이 기기에서 바꾼 것으로 치지 않는다) */
  apply(key: SyncKey, value: unknown): void
  /** 키마다 이 기기에서 마지막으로 바꾼 시각 */
  changedAt(): Partial<Record<SyncKey, string>>
}

/** 마지막 동기화 기록. 계정·드라이브 파일이 같을 때만 다음 동기화의 base 로 쓴다 */
export interface SyncBase {
  accountId: string
  fileId: string
  /** 이 기기 저장값을 읽은 시각. 이 뒤에 바꾼 키만 다음 동기화에서 '이 기기에서 바꾼 값'으로 본다 */
  syncedAt: string
  values: SyncValues
}

export interface SyncOutcome {
  base: SyncBase
  summary: SyncSummary
  /** 이 계정·파일과 처음 맞췄다 (양쪽을 합치기만 함) */
  first: boolean
}

export type SyncErrorKind = 'newer' | 'busy'

export class SyncError extends Error {
  readonly kind: SyncErrorKind
  constructor(kind: SyncErrorKind) {
    super(
      kind === 'newer'
        ? '새 버전의 사이트가 저장한 동기화 데이터예요. 페이지를 새로 고친 뒤 다시 동기화해 주세요'
        : '동기화하는 동안 계속 바뀌어서 맞추지 못했어요. 잠시 뒤 다시 해 주세요',
    )
    this.kind = kind
  }
}

/** 받고 합쳐서 올리는 걸 다시 시도하는 횟수 (그사이 다른 기기가 올렸거나 이 기기에서 바꿨을 때) */
const ATTEMPTS = 3

export async function syncOnce({
  drive,
  local,
  accountId,
  base,
  now,
}: {
  drive: DriveFiles
  local: LocalStore
  accountId: string
  base: SyncBase | null
  now: () => string
}): Promise<SyncOutcome> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const meta = await drive.find()
    let remote: SyncFile | null = null
    if (meta) {
      const parsed = parseSyncFile(await drive.read(meta.id))
      if ('newer' in parsed) throw new SyncError('newer')
      // 깨진 파일은 없는 것으로 보고 이 기기 값으로 다시 쓴다
      if ('file' in parsed) remote = parsed.file
    }
    const usable = base && meta && remote && base.accountId === accountId && base.fileId === meta.id ? base : null

    const startedAt = now()
    const raws = SYNC_KEYS.map((key) => local.readRaw(key))
    const values: SyncValues = {}
    SYNC_KEYS.forEach((key, i) => {
      const value = parseRaw(raws[i])
      if (value !== undefined) values[key] = value
    })
    const changedAt = local.changedAt()
    const localChanged = new Set(SYNC_KEYS.filter((key) => usable && (changedAt[key] ?? '') >= usable.syncedAt))
    const result = mergeSync({
      local: values,
      localChanged,
      localChangedAt: changedAt,
      base: usable?.values ?? null,
      remote,
      now: startedAt,
    })

    let fileId = meta?.id
    if (result.upload) {
      if (meta) {
        // 그사이 다른 기기가 올렸으면 받아서 다시 합친다
        if ((await drive.version(meta.id)) !== meta.version) continue
        fileId = (await drive.update(meta.id, result.upload)).id
      } else {
        fileId = (await drive.create(result.upload)).id
      }
    }
    // 그사이 이 기기에서 바꿨으면 받은 값으로 덮지 않게 다시 합친다 (올린 값은 다음 차례에 드라이브 쪽 값이 된다)
    if (SYNC_KEYS.some((key, i) => local.readRaw(key) !== raws[i])) continue
    if (fileId === undefined) continue
    for (const key of SYNC_KEYS) {
      if (result.localUpdates[key] !== undefined) local.apply(key, result.localUpdates[key])
    }
    return {
      base: { accountId, fileId, syncedAt: startedAt, values: result.values },
      summary: result.summary,
      first: !usable,
    }
  }
  throw new SyncError('busy')
}

function parseRaw(raw: string | null): unknown {
  if (raw === null) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}
