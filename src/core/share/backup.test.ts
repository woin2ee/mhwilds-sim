import { describe, expect, it } from 'vitest'
import { fillDecorations, seededRandom } from '../../test/builds'
import { armorByName, decorationIdByName, loadTestDb, skillIdByName } from '../../test/testDb'
import { computeBuild } from '../calc'
import type { SavedBuild } from '../savedBuilds'
import { emptyBuild, type BuildState, type CustomTalisman } from '../types'
import {
  attachTalisman,
  createBackup,
  decodeBuild,
  encodeBuild,
  importBackup,
  sameTalisman,
  ShareCodeError,
  type BackupFile,
} from './index'

const db = loadTestDb()
const attack = skillIdByName(db, '공격')
const weakness = skillIdByName(db, '약점 특효')

const used: CustomTalisman = {
  id: 'used',
  name: '쓰는 호석',
  rarity: 8,
  skills: [
    { skillId: attack, level: 2 },
    { skillId: weakness, level: 1 },
  ],
  slots: [
    { kind: 'weapon', level: 1 },
    { kind: 'armor', level: 1 },
  ],
}
const unused: CustomTalisman = { id: 'unused', name: '안 쓰는 호석', rarity: null, skills: [{ skillId: weakness, level: 2 }], slots: [] }

function counter(prefix: string): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}

function saved(id: string, name: string, build: BuildState): SavedBuild {
  return { id, name, memo: `${name} 메모`, build, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' }
}

function makeSavedBuilds(): SavedBuild[] {
  const rand = seededRandom(3)
  const withCustom = emptyBuild()
  for (const name of ['슈바르카헬름γ', '슈바르카메일γ', '슈바르카암γ', '슈바르카코일γ', '슈바르카그리브γ']) {
    const piece = armorByName(db, name)
    withCustom.armor[piece.kind] = { id: piece.id, transcend: false }
  }
  withCustom.weapon = { type: 'db', id: db.data.weapons.find((w) => w.slots.length === 3)!.id }
  withCustom.talisman = { type: 'custom', id: used.id }
  const withFixed = { ...emptyBuild(), talisman: { type: 'fixed' as const, id: db.data.talismans[0].id } }
  withFixed.armor.head = { id: armorByName(db, '콩가헬름α').id, transcend: true }
  return [
    saved('a', '감정 호석 세팅', fillDecorations(db, withCustom, [used, unused], rand, 1)),
    saved('b', '제작 호석 세팅', fillDecorations(db, withFixed, [used, unused], rand, 1)),
    saved('c', '빈 세팅', emptyBuild()),
  ]
}

const roundTripJson = (file: BackupFile): unknown => JSON.parse(JSON.stringify(file))
const summary = (build: BuildState, talismans: readonly CustomTalisman[]) => computeBuild(db, build, talismans)

describe('attachTalisman', () => {
  it('내용이 같으면 이름·슬롯 순서가 달라도 재사용하고 장식주 위치를 맞춘다', () => {
    const build = emptyBuild()
    build.talisman = { type: 'custom', id: used.id }
    const weaponDeco = decorationIdByName(db, '독주【1】')
    const armorDeco = decorationIdByName(db, '내수주【1】')
    build.decorations.talisman = [weaponDeco, armorDeco]
    const decoded = decodeBuild(db, encodeBuild(db, build, [used], null))

    const mine: CustomTalisman = { ...used, id: 'mine', name: '다른 이름', slots: [...used.slots].reverse() }
    expect(sameTalisman(mine, used)).toBe(true)
    const attached = attachTalisman(decoded, [unused, mine], counter('new'))
    expect(attached.added).toBeNull()
    expect(attached.customTalismans).toHaveLength(2)
    expect(attached.build.talisman).toEqual({ type: 'custom', id: 'mine' })
    expect(attached.build.decorations.talisman).toEqual([armorDeco, weaponDeco])
    expect(summary(attached.build, [mine]).slots.every((s) => s.valid)).toBe(true)
  })

  it('내용이 다르면 새로 추가 (이름이 비면 기본 이름)', () => {
    const build = emptyBuild()
    build.talisman = { type: 'custom', id: 'x' }
    const nameless: CustomTalisman = { ...used, id: 'x', name: '' }
    const decoded = decodeBuild(db, encodeBuild(db, build, [nameless], null))
    const attached = attachTalisman(decoded, [unused], counter('new'))
    expect(attached.added).toMatchObject({ id: 'new-1', name: '공유받은 호석', skills: used.skills, slots: used.slots })
    expect(attached.customTalismans.map((t) => t.id)).toEqual(['unused', 'new-1'])
  })

  it('호석 내용 없이 자리표시자만 있으면 호석을 비운다', () => {
    const build = { ...emptyBuild(), talisman: { type: 'custom' as const, id: '' } }
    const attached = attachTalisman({ name: null, build, talisman: null, missing: [] }, [], counter('new'))
    expect(attached.build.talisman).toBeNull()
  })
})

describe('백업', () => {
  const savedBuilds = makeSavedBuilds()
  const talismans = [used, unused]

  it('빈 상태로 가져오면 세팅·호석이 모두 복원된다', () => {
    const file = roundTripJson(createBackup(db, savedBuilds, talismans))
    const result = importBackup(db, file, { savedBuilds: [], customTalismans: [] }, counter('id'))
    expect(result).toMatchObject({ addedBuilds: 3, addedTalismans: 2, skippedBuilds: 0, missing: [] })
    expect(result.customTalismans.map((t) => t.name)).toEqual(['쓰는 호석', '안 쓰는 호석'])
    result.savedBuilds.forEach((restored, i) => {
      const original = savedBuilds[i]
      expect(restored).toMatchObject({ name: original.name, memo: original.memo, createdAt: original.createdAt, updatedAt: original.updatedAt })
      expect(restored.id).not.toBe(original.id)
      expect(summary(restored.build, result.customTalismans)).toEqual(summary(original.build, talismans))
    })
  })

  it('같은 백업을 다시 가져오면 모두 건너뛴다', () => {
    const file = roundTripJson(createBackup(db, savedBuilds, talismans))
    const first = importBackup(db, file, { savedBuilds: [], customTalismans: [] }, counter('id'))
    const second = importBackup(db, file, first, counter('id2'))
    expect(second).toMatchObject({ addedBuilds: 0, addedTalismans: 0, skippedBuilds: 3 })
    expect(second.savedBuilds).toHaveLength(3)
    expect(second.customTalismans).toHaveLength(2)
  })

  it('일부가 이미 있으면 없는 것만 더한다 (호석은 이름이 달라도 내용으로 판단)', () => {
    const file = roundTripJson(createBackup(db, savedBuilds, talismans))
    const myUsed: CustomTalisman = { ...used, id: 'my-used', name: '내가 붙인 이름' }
    const existing = { ...savedBuilds[0], id: 'mine', build: { ...savedBuilds[0].build, talisman: { type: 'custom' as const, id: 'my-used' } } }
    const result = importBackup(db, file, { savedBuilds: [existing], customTalismans: [myUsed] }, counter('id'))
    expect(result).toMatchObject({ addedBuilds: 2, addedTalismans: 1, skippedBuilds: 1 })
    expect(result.customTalismans.map((t) => t.id)).toEqual(['my-used', 'id-1'])
  })

  it('호석 스킬은 게임 내부 id 로 찾는다 (MHDB id 가 바뀌어도 복원)', () => {
    const file = createBackup(db, [], [unused])
    file.talismans[0].skills[0].skillId = 999_999 // 바뀐 MHDB id 흉내
    const result = importBackup(db, roundTripJson(file), { savedBuilds: [], customTalismans: [] }, counter('id'))
    expect(result.customTalismans[0].skills).toEqual([{ skillId: weakness, level: 2 }])

    const unknown = createBackup(db, [], [unused])
    unknown.talismans[0].skillGameIds = [123_456_789]
    const dropped = importBackup(db, roundTripJson(unknown), { savedBuilds: [], customTalismans: [] }, counter('id'))
    expect(dropped.missing).toEqual(["호석 '안 쓰는 호석': 스킬 1개"])
  })

  it('읽을 수 없는 세팅 코드는 건너뛰고 알려 준다', () => {
    const file = createBackup(db, savedBuilds.slice(0, 1), talismans)
    file.builds.push({ ...file.builds[0], name: '망가진 세팅', code: '!!!' })
    const result = importBackup(db, roundTripJson(file), { savedBuilds: [], customTalismans: [] }, counter('id'))
    expect(result.addedBuilds).toBe(1)
    expect(result.missing).toEqual(["세팅 '망가진 세팅': 코드를 읽을 수 없음"])
  })

  it('형식이 틀린 파일은 ShareCodeError', () => {
    const valid = roundTripJson(createBackup(db, savedBuilds, talismans)) as Record<string, unknown>
    const cases: unknown[] = [
      null,
      [],
      'text',
      {},
      { ...valid, app: 'other' },
      { ...valid, talismans: 'x' },
      { ...valid, builds: [{ name: '코드 없음' }] },
      { ...valid, talismans: [{ name: 'x', skills: [{ skillId: 1, level: 0 }], slots: [] }] },
      { ...valid, talismans: [{ name: 'x', skills: [], slots: [{ kind: 'armor', level: 4 }] }] },
    ]
    for (const input of cases) {
      expect(() => importBackup(db, input, { savedBuilds: [], customTalismans: [] }, counter('id'))).toThrow(ShareCodeError)
    }
    expect(() =>
      importBackup(db, { ...valid, version: 2 }, { savedBuilds: [], customTalismans: [] }, counter('id')),
    ).toThrow('지원하지 않는 백업 버전이에요')
  })
})
