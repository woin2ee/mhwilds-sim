import { describe, expect, it } from 'vitest'
import type { SavedBuild } from '../../core/savedBuilds'
import { emptyBuild, type CustomTalisman, type Slot, type TalismanChoice, type TalismanRef } from '../../core/types'
import { STORAGE_KEYS as K } from '../../state/storedValues'
import { DEFAULT_CONDITIONS, normalizeConditions, type SearchConditions } from '../search/conditions'
import { presetPart, type SearchPreset } from '../search/presets'
import {
  mergeSync,
  parseSyncFile,
  summaryText,
  type MergeInput,
  type SyncFile,
  type SyncKey,
  type SyncSummary,
  type SyncValues,
} from './syncData'

const T0 = '2026-10-01T00:00:00.000Z'
const T1 = '2026-10-02T00:00:00.000Z'
const T2 = '2026-10-03T00:00:00.000Z'
const T3 = '2026-10-04T00:00:00.000Z'

const armor = (level: 1 | 2 | 3): Slot => ({ kind: 'armor', level })
const talisman = (id: string, skillId: number, slots: Slot[] = [armor(1)]): CustomTalisman => ({
  id,
  name: '',
  rarity: null,
  skills: [{ skillId, level: 1 }],
  slots,
})
const saved = (id: string, name = id, talismanChoice: TalismanChoice | null = null, decorations: number[] = []): SavedBuild => {
  const build = { ...emptyBuild(), talisman: talismanChoice }
  build.decorations = { ...build.decorations, talisman: decorations }
  return { id, name, memo: '', build, createdAt: T0, updatedAt: T0 }
}
const custom = (id: string): TalismanRef => ({ type: 'custom', id })
const cond = (patch: Partial<SearchConditions> = {}) => normalizeConditions({ ...DEFAULT_CONDITIONS, ...patch })
const preset = (id: string, name: string, patch: Partial<SearchConditions> = {}): SearchPreset => ({
  id,
  name,
  conditions: presetPart(cond(patch)),
  updatedAt: T0,
})
const file = (values: Record<string, unknown>, changedAt: Record<string, string> = {}): SyncFile => ({
  app: 'mhwilds-sim',
  kind: 'sync',
  version: 1,
  savedAt: T1,
  values,
  changedAt,
})
const merge = (input: Partial<MergeInput> & { local: SyncValues }) =>
  mergeSync({ localChanged: new Set(), localChangedAt: {}, base: null, remote: null, now: T3, ...input })
const changedKeys = (...keys: SyncKey[]) => new Set<SyncKey>(keys)
const idsOf = (value: unknown) => (value as { id: string }[]).map((item) => item.id)
const noChange: SyncSummary = {
  builds: { added: 0, removed: 0, changed: 0 },
  talismans: { added: 0, removed: 0, changed: 0 },
  presets: { added: 0, removed: 0, changed: 0 },
  conditions: false,
  manual: false,
}

describe('동기화 병합', () => {
  it('드라이브에 파일이 없으면 이 기기 값을 그대로 올린다', () => {
    const local = { [K.savedBuilds]: [saved('a')], [K.talismans]: [talisman('t', 1)] }
    const result = merge({ local, localChangedAt: { [K.savedBuilds]: T1 } })
    expect(result.upload?.values).toEqual(local)
    expect(result.upload?.changedAt).toEqual({ [K.savedBuilds]: T1, [K.talismans]: T3 })
    expect(result.localUpdates).toEqual({})
    expect(result.summary).toEqual(noChange)
  })

  it('처음 동기화: 양쪽에 따로 넣은 같은 호석·세팅·조건은 드라이브 것 하나로 합치고, 가리키던 값을 옮긴다', () => {
    // 이 기기 호석과 슬롯 순서만 다른 같은 호석 → 장식주 위치도 드라이브 호석에 맞춘다
    const mine = talisman('mine', 1, [armor(1), armor(2)])
    const theirs = talisman('theirs', 1, [armor(2), armor(1)])
    const local = {
      [K.talismans]: [mine, talisman('only-mine', 2)],
      [K.savedBuilds]: [saved('b-mine', '회심', custom('mine'), [10, 20]), saved('b-new', '새 세팅')],
      [K.searchPresets]: [preset('p-mine', '대검', { talismanMode: 'fixed', fixedTalisman: custom('mine') })],
      [K.searchConditions]: cond({ talismanMode: 'fixed', fixedTalisman: custom('mine') }),
      [K.searchPresetActive]: 'p-mine',
      [K.manualBuild]: saved('x', 'x', custom('mine'), [10, 20]).build,
      [K.manualSource]: 'b-mine',
    }
    const remote = file({
      [K.talismans]: [theirs],
      [K.savedBuilds]: [saved('b-theirs', '회심', custom('theirs'), [20, 10])],
      [K.searchPresets]: [preset('p-theirs', '대검', { talismanMode: 'fixed', fixedTalisman: custom('theirs') })],
    })
    const result = merge({ local, remote })
    expect(idsOf(result.values[K.talismans])).toEqual(['theirs', 'only-mine'])
    expect(idsOf(result.values[K.savedBuilds])).toEqual(['b-theirs', 'b-new'])
    expect(idsOf(result.values[K.searchPresets])).toEqual(['p-theirs'])
    expect((result.values[K.searchConditions] as SearchConditions).fixedTalisman).toEqual(custom('theirs'))
    expect(result.values[K.searchPresetActive]).toBe('p-theirs')
    expect(result.values[K.manualBuild]).toMatchObject({ talisman: custom('theirs'), decorations: { talisman: [20, 10] } })
    expect(result.values[K.manualSource]).toBe('b-theirs')
    // 같은 것으로 본 항목은 받은 것으로 세지 않는다
    expect(result.summary).toEqual(noChange)
    expect(result.upload).not.toBeNull()
  })

  it('처음 동기화는 지우지 않고, 지금 검색 조건·수동 세팅은 이 기기에서 바꾼 기록이 없으면 드라이브 것을 쓴다', () => {
    const local = { [K.savedBuilds]: [saved('a')], [K.searchConditions]: cond({ includeLowRank: true }) }
    const remote = file(
      { [K.savedBuilds]: [saved('b')], [K.searchConditions]: cond({ transcend: true }), [K.searchPresetActive]: null },
      { [K.searchConditions]: T1 },
    )
    const result = merge({ local, remote })
    expect(idsOf(result.values[K.savedBuilds])).toEqual(['a', 'b'])
    expect(result.values[K.searchConditions]).toMatchObject({ transcend: true, includeLowRank: false })
    expect(result.summary).toMatchObject({ builds: { added: 1, removed: 0, changed: 0 }, conditions: true })
    // 이 기기에서 더 나중에 바꿨으면 이 기기 것
    const mineNewer = merge({ local, remote, localChangedAt: { [K.searchConditions]: T2 } })
    expect(mineNewer.values[K.searchConditions]).toMatchObject({ includeLowRank: true })
  })

  it('지운 것도 다른 기기로 퍼진다 (마지막 동기화와 비교)', () => {
    const base = { [K.savedBuilds]: [saved('a'), saved('b'), saved('c')] }
    const local = { [K.savedBuilds]: [saved('a'), saved('c')] } // b 를 지움
    const remote = file({ [K.savedBuilds]: [saved('d'), saved('b'), saved('c')] }) // a 를 지우고 d 를 더함
    const result = merge({ local, base, remote, localChanged: changedKeys(K.savedBuilds) })
    expect(idsOf(result.values[K.savedBuilds])).toEqual(['d', 'c'])
    expect(idsOf(result.upload?.values[K.savedBuilds])).toEqual(['d', 'c'])
    expect(result.summary.builds).toEqual({ added: 1, removed: 1, changed: 0 })
  })

  it('이 기기에서 바꾼 기록이 없는 키는 저장값이 달라도 마지막 동기화 때 값으로 본다', () => {
    // 저장값이 깨져 기본값([])이 된 경우: 지운 것으로 드라이브에 퍼지지 않고 드라이브 값으로 되살린다
    const base = { [K.savedBuilds]: [saved('a'), saved('b')] }
    const remote = file(base)
    const result = merge({ local: { [K.savedBuilds]: [] }, base, remote })
    expect(result.upload).toBeNull()
    expect(idsOf(result.localUpdates[K.savedBuilds])).toEqual(['a', 'b'])
  })

  it('같은 세팅을 양쪽에서 고쳤으면 고친 시각이 나중인 쪽', () => {
    const base = { [K.savedBuilds]: [saved('a')] }
    const local = { [K.savedBuilds]: [{ ...saved('a', '내 이름'), updatedAt: T2 }] }
    const remote = file({ [K.savedBuilds]: [{ ...saved('a', '다른 기기 이름'), updatedAt: T1 }] })
    const result = merge({ local, base, remote, localChanged: changedKeys(K.savedBuilds) })
    expect(result.values[K.savedBuilds]).toMatchObject([{ name: '내 이름' }])
    expect(result.localUpdates).toEqual({})
  })

  it('지금 검색 조건은 불러온 저장한 조건과 함께, 둘 다 바꿨으면 나중에 바꾼 쪽을 고른다', () => {
    const base = { [K.searchConditions]: cond(), [K.searchPresetActive]: null }
    const local = { [K.searchConditions]: cond({ transcend: true }), [K.searchPresetActive]: null }
    const remote = (at: string) =>
      file({ [K.searchConditions]: cond({ excludeHr100: true }), [K.searchPresetActive]: 'p' }, { [K.searchConditions]: at })
    const input = { local, base, localChanged: changedKeys(K.searchConditions), localChangedAt: { [K.searchConditions]: T2 } }
    const remoteNewer = merge({ ...input, remote: remote(T3) })
    expect(remoteNewer.values[K.searchConditions]).toMatchObject({ excludeHr100: true, transcend: false })
    expect(remoteNewer.values[K.searchPresetActive]).toBe('p')
    const localNewer = merge({ ...input, remote: remote(T1) })
    expect(localNewer.values[K.searchConditions]).toMatchObject({ excludeHr100: false, transcend: true })
    expect(localNewer.values[K.searchPresetActive]).toBeNull()
    expect(localNewer.upload?.changedAt[K.searchConditions]).toBe(T2)
  })

  it('다른 기기에서 지운 내 호석을 가리키는 세팅은 세팅 전용 호석으로 바꾼다', () => {
    const t = talisman('t', 1)
    const base = { [K.talismans]: [t], [K.savedBuilds]: [saved('a', 'a', custom('t'))] }
    // 이 기기: 그 호석으로 새 세팅을 저장 / 다른 기기: 호석을 지워 그 기기의 세팅은 세팅 전용 호석이 됨
    const local = { [K.talismans]: [t], [K.savedBuilds]: [saved('new', 'new', custom('t')), saved('a', 'a', custom('t'))] }
    const inline: TalismanChoice = { type: 'inline', talisman: { name: '', rarity: null, skills: t.skills, slots: t.slots } }
    const remote = file({ [K.talismans]: [], [K.savedBuilds]: [saved('a', 'a', inline)] })
    const result = merge({ local, base, remote, localChanged: changedKeys(K.savedBuilds) })
    expect(result.values[K.talismans]).toEqual([])
    expect(result.values[K.savedBuilds]).toMatchObject([{ id: 'new', build: { talisman: inline } }, { id: 'a', build: { talisman: inline } }])
  })

  it('드라이브와 같으면 올리지 않고, 이 버전이 모르는 키는 지우지 않고 그대로 올린다', () => {
    const values = { [K.savedBuilds]: [saved('a')] }
    expect(merge({ local: values, base: values, remote: file(values) }).upload).toBeNull()
    const remote = file({ ...values, 'future:v1': 1 }, { 'future:v1': T1 })
    const result = merge({
      local: { [K.savedBuilds]: [saved('a'), saved('b')] },
      base: values,
      remote,
      localChanged: changedKeys(K.savedBuilds),
    })
    expect(result.upload?.values['future:v1']).toBe(1)
    expect(result.upload?.changedAt['future:v1']).toBe(T1)
  })

  it('형식이 틀린 드라이브 값은 없는 것으로 보고, 깨진 항목만 빼고 나머지는 살린다', () => {
    const local = { [K.savedBuilds]: [saved('a')] }
    const broken = merge({ local, remote: file({ [K.savedBuilds]: 'oops' }) })
    expect(idsOf(broken.values[K.savedBuilds])).toEqual(['a'])
    expect(broken.upload).not.toBeNull()
    const partly = merge({ local, remote: file({ [K.savedBuilds]: [{ id: 'bad' }, saved('b')] }) })
    expect(idsOf(partly.values[K.savedBuilds])).toEqual(['a', 'b'])
  })
})

describe('동기화 파일', () => {
  it('더 새 버전이 쓴 파일은 newer, 모양이 틀리면 invalid', () => {
    expect(parseSyncFile({ ...file({}), version: 2 })).toEqual({ newer: true })
    expect(parseSyncFile({ ...file({}), app: 'other' })).toEqual({ invalid: true })
    expect(parseSyncFile('nope')).toEqual({ invalid: true })
    expect(parseSyncFile({ ...file({ a: 1 }), changedAt: { a: T1, b: 3 } })).toEqual({
      file: { ...file({ a: 1 }), changedAt: { a: T1 } },
    })
  })

  it('알림 문구', () => {
    expect(summaryText(noChange)).toBe('')
    expect(
      summaryText({
        ...noChange,
        builds: { added: 2, removed: 0, changed: 1 },
        talismans: { added: 0, removed: 1, changed: 0 },
        conditions: true,
      }),
    ).toBe('내 세팅 2개 추가·1개 수정 · 내 호석 1개 삭제 · 검색 조건 바뀜')
  })
})
