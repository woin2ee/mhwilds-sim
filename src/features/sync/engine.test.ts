import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS as K } from '../../state/storedValues'
import { SyncError, syncOnce, type DriveFiles, type LocalStore, type SyncBase } from './engine'
import { SYNC_FILE_VERSION, type SyncFile, type SyncKey } from './syncData'

const build = (id: string) => ({
  id,
  name: id,
  memo: '',
  build: { weapon: null, armor: {}, talisman: null, decorations: {} },
  createdAt: '',
  updatedAt: '',
})

/** 메모리 드라이브. hooks 로 받기·올리기 사이에 다른 기기가 끼어드는 상황을 만든다 */
class FakeDrive implements DriveFiles {
  file: { id: string; version: number; content: unknown } | null = null
  uploads = 0
  beforeVersionCheck?: () => void

  async find() {
    return this.file && { id: this.file.id, version: String(this.file.version) }
  }
  async read(id: string) {
    if (this.file?.id !== id) throw new Error('not found')
    return structuredClone(this.file.content)
  }
  async create(content: SyncFile) {
    this.uploads++
    this.file = { id: 'file-1', version: 1, content: structuredClone(content) }
    return { id: this.file.id, version: '1' }
  }
  async update(id: string, content: SyncFile) {
    if (this.file?.id !== id) throw new Error('not found')
    this.uploads++
    this.file = { id, version: this.file.version + 1, content: structuredClone(content) }
    return { id, version: String(this.file.version) }
  }
  async version(id: string) {
    this.beforeVersionCheck?.()
    this.beforeVersionCheck = undefined
    return this.file?.id === id ? String(this.file.version) : null
  }
  /** 다른 기기가 올린 것처럼 값을 바꾼다 */
  put(values: Record<string, unknown>) {
    const content: SyncFile = { app: 'mhwilds-sim', kind: 'sync', version: SYNC_FILE_VERSION, savedAt: '', values, changedAt: {} }
    this.file = { id: this.file?.id ?? 'file-1', version: (this.file?.version ?? 0) + 1, content }
  }
  values() {
    return (this.file!.content as SyncFile).values
  }
}

/** 메모리 저장소 (한 기기) */
class FakeDevice implements LocalStore {
  raw = new Map<string, string>()
  changed: Partial<Record<SyncKey, string>> = {}
  base: SyncBase | null = null
  clock = 0
  constructor(values: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(values)) this.raw.set(key, JSON.stringify(value))
  }
  readRaw(key: string) {
    return this.raw.get(key) ?? null
  }
  apply(key: string, value: unknown) {
    this.raw.set(key, JSON.stringify(value))
  }
  changedAt() {
    return this.changed
  }
  /** 사용자가 바꾼 것처럼 저장하고 바꾼 시각을 남긴다 */
  edit(key: SyncKey, value: unknown) {
    this.raw.set(key, JSON.stringify(value))
    this.changed[key] = this.now()
  }
  now = () => new Date(Date.UTC(2026, 9, 1, 0, 0, this.clock++)).toISOString()
  value(key: string) {
    return JSON.parse(this.raw.get(key) ?? 'null') as unknown
  }
  async sync(drive: DriveFiles) {
    const outcome = await syncOnce({ drive, local: this, accountId: 'me', base: this.base, now: this.now })
    this.base = outcome.base
    return outcome
  }
}

const ids = (value: unknown) => (value as { id: string }[]).map((item) => item.id)

describe('동기화 한 번', () => {
  it('첫 기기는 파일을 만들고, 둘째 기기는 합친 뒤 올리며, 첫 기기는 다음 동기화에 받는다', async () => {
    const drive = new FakeDrive()
    const pc = new FakeDevice({ [K.savedBuilds]: [build('a')] })
    const phone = new FakeDevice({ [K.savedBuilds]: [build('b')] })

    expect((await pc.sync(drive)).first).toBe(true)
    expect(ids(drive.values()[K.savedBuilds])).toEqual(['a'])

    const second = await phone.sync(drive)
    expect(second.first).toBe(true)
    expect(ids(phone.value(K.savedBuilds))).toEqual(['b', 'a'])
    expect(ids(drive.values()[K.savedBuilds])).toEqual(['b', 'a'])

    const third = await pc.sync(drive)
    expect(third.first).toBe(false)
    expect(third.summary.builds).toEqual({ added: 1, removed: 0, changed: 0 })
    expect(ids(pc.value(K.savedBuilds))).toEqual(['b', 'a'])
  })

  it('한 기기에서 지우면 다른 기기에서도 지워지고, 바꾼 게 없으면 올리지 않는다', async () => {
    const drive = new FakeDrive()
    const pc = new FakeDevice({ [K.savedBuilds]: [build('a'), build('b')] })
    const phone = new FakeDevice()
    await pc.sync(drive)
    await phone.sync(drive)

    phone.edit(K.savedBuilds, [build('b')])
    await phone.sync(drive)
    const uploads = drive.uploads
    await pc.sync(drive)
    expect(ids(pc.value(K.savedBuilds))).toEqual(['b'])
    expect(drive.uploads).toBe(uploads)
  })

  it('받고 올리는 사이 다른 기기가 올렸으면 다시 받아 합친다', async () => {
    const drive = new FakeDrive()
    const pc = new FakeDevice({ [K.savedBuilds]: [build('a')] })
    await pc.sync(drive)
    pc.edit(K.savedBuilds, [build('a'), build('pc')])
    drive.beforeVersionCheck = () => drive.put({ [K.savedBuilds]: [build('a'), build('phone')] })
    await pc.sync(drive)
    expect(ids(drive.values()[K.savedBuilds])).toEqual(['a', 'pc', 'phone'])
    expect(ids(pc.value(K.savedBuilds))).toEqual(['a', 'pc', 'phone'])
  })

  it('올리는 사이 이 기기에서 바꿨으면 받은 값으로 덮지 않고 다시 합친다', async () => {
    const drive = new FakeDrive()
    const pc = new FakeDevice({ [K.savedBuilds]: [build('a')] })
    await pc.sync(drive)
    drive.put({ [K.savedBuilds]: [build('a'), build('phone')] })
    pc.edit(K.savedBuilds, [build('a'), build('pc')])
    // 합친 값을 올리는 동안 이 기기에서 a 를 지운다
    drive.beforeVersionCheck = () => pc.edit(K.savedBuilds, [build('pc')])
    await pc.sync(drive)
    expect(ids(pc.value(K.savedBuilds))).toEqual(['pc', 'phone'])
    expect(ids(drive.values()[K.savedBuilds])).toEqual(['pc', 'phone'])
  })

  it('새 버전이 쓴 파일은 덮어쓰지 않는다', async () => {
    const drive = new FakeDrive()
    drive.put({})
    ;(drive.file!.content as SyncFile).version = SYNC_FILE_VERSION + 1
    await expect(new FakeDevice().sync(drive)).rejects.toEqual(new SyncError('newer'))
    expect(drive.uploads).toBe(0)
  })

  it('다른 계정이나 새로 만든 파일이면 마지막 동기화 기록을 쓰지 않고 합치기만 한다', async () => {
    const drive = new FakeDrive()
    const pc = new FakeDevice({ [K.savedBuilds]: [build('a')] })
    await pc.sync(drive)
    // 드라이브 파일이 지워지고 다른 기기가 새로 만들었다: 마지막 동기화 기록과 비교하면 a 를 지운 것이 된다
    drive.file = null
    await new FakeDevice({ [K.savedBuilds]: [build('b')] }).sync(drive)
    drive.file!.id = 'file-2'
    const outcome = await pc.sync(drive)
    expect(outcome.first).toBe(true)
    expect(ids(pc.value(K.savedBuilds))).toEqual(['a', 'b'])
  })
})
