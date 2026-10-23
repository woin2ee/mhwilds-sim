import { describe, expect, it } from 'vitest'
import { fillDecorations, seededRandom } from '../../test/builds'
import { armorByName, loadTestDb, skillIdByName } from '../../test/testDb'
import { computeBuild } from '../calc'
import type { SavedBuild } from '../savedBuilds'
import { emptyBuild, type BuildState, type CustomTalisman } from '../types'
import { toBase64Url } from './binary'
import {
  createBackup,
  decodeBackupCode,
  decodeBuild,
  encodeBackupCode,
  encodeBuild,
  extractShareCode,
  hasBackupCode,
  importBackup,
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

describe('백업', () => {
  const savedBuilds = makeSavedBuilds()
  const talismans = [used, unused]

  it('빈 상태로 가져오면 세팅·호석이 모두 복원된다', () => {
    const backup = createBackup(db, savedBuilds, talismans)
    const result = importBackup(db, roundTripJson(backup), { savedBuilds: [], customTalismans: [] }, counter('id'))
    expect(result).toMatchObject({ addedBuilds: 3, addedTalismans: 2, skippedBuilds: 0, missing: [] })
    expect(result.exportedAt).toBe(backup.exportedAt)
    expect(result.customTalismans.map((t) => t.name)).toEqual(['쓰는 호석', '안 쓰는 호석'])
    result.savedBuilds.forEach((restored, i) => {
      const original = savedBuilds[i]
      expect(restored).toMatchObject({ name: original.name, memo: original.memo, createdAt: original.createdAt, updatedAt: original.updatedAt })
      expect(restored.id).not.toBe(original.id)
      expect(summary(restored.build, result.customTalismans)).toEqual(summary(original.build, talismans))
    })
  })

  it('가져올 때 쓰지 않는 호석 id 와 코드 속 이름은 담지 않는다', () => {
    const file = createBackup(db, savedBuilds, talismans)
    for (const t of file.talismans) expect(t).not.toHaveProperty('id')
    for (const b of file.builds) expect(decodeBuild(db, b.code).name).toBeNull()
  })

  it('예전 형식(호석 id, 이름 든 코드)의 백업도 똑같이 가져온다', () => {
    const file = createBackup(db, savedBuilds, talismans)
    const old = {
      ...file,
      talismans: file.talismans.map((t, i) => ({ ...t, id: talismans[i].id })),
      builds: file.builds.map((b, i) => ({ ...b, code: encodeBuild(db, savedBuilds[i].build, talismans, b.name) })),
    }
    const empty = { savedBuilds: [], customTalismans: [] }
    expect(importBackup(db, roundTripJson(old), empty, counter('id'))).toEqual(
      importBackup(db, roundTripJson(file), empty, counter('id')),
    )
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

  it('세팅의 세팅 전용 호석은 내 호석에 넣지 않고 세팅에 그대로 담는다', () => {
    const shared = {
      ...emptyBuild(),
      talisman: { type: 'inline' as const, talisman: { name: '받은 호석', rarity: 7, skills: [{ skillId: attack, level: 1 }], slots: [] } },
    }
    const file = createBackup(db, [saved('d', '공유받은 세팅', shared)], [used])
    expect(file.talismans.map((t) => t.name)).toEqual(['쓰는 호석'])
    const result = importBackup(db, roundTripJson(file), { savedBuilds: [], customTalismans: [] }, counter('id'))
    expect(result).toMatchObject({ addedBuilds: 1, addedTalismans: 1, skippedBuilds: 0 })
    expect(result.customTalismans.map((t) => t.name)).toEqual(['쓰는 호석'])
    expect(result.savedBuilds[0].build.talisman).toEqual(shared.talisman)
    // 그사이 같은 호석을 내 호석에 넣었다면 그 호석에 연결한다
    const mine: CustomTalisman = { ...shared.talisman.talisman, id: 'mine', name: '내 이름' }
    const linked = importBackup(db, roundTripJson(file), { savedBuilds: [], customTalismans: [mine] }, counter('id'))
    expect(linked.savedBuilds[0].build.talisman).toEqual({ type: 'custom', id: 'mine' })
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

describe('백업 코드', () => {
  const savedBuilds = makeSavedBuilds()
  const talismans = [used, unused]
  const empty = { savedBuilds: [], customTalismans: [] }

  it('백업 코드로 옮겨도 파일과 똑같이 가져온다', async () => {
    const file = createBackup(db, savedBuilds, talismans)
    const code = await encodeBackupCode(file)
    expect(code).toMatch(/^mhwilds-backup-1\.[A-Za-z0-9_-]+$/)
    expect(code.length).toBeLessThan(JSON.stringify(file).length)
    expect(await decodeBackupCode(code)).toEqual(roundTripJson(file))
    expect(importBackup(db, await decodeBackupCode(code), empty, counter('id'))).toEqual(
      importBackup(db, roundTripJson(file), empty, counter('id')),
    )
  })

  it('앞뒤 글, 중간 줄바꿈·공백, 대문자 앞머리를 견딘다', async () => {
    const file = createBackup(db, savedBuilds, talismans)
    const code = await encodeBackupCode(file)
    const wrapped = code.replace(/(.{40})/g, '$1\n ')
    for (const text of [`  ${code}\n`, `몬헌 백업\n${wrapped}`, `${code}입니다`, code.replace('mhwilds', 'MHWILDS')]) {
      expect(hasBackupCode(text)).toBe(true)
      expect(await decodeBackupCode(text)).toEqual(roundTripJson(file))
    }
  })

  it('공유 코드·링크와 섞이지 않는다', async () => {
    const code = await encodeBackupCode(createBackup(db, savedBuilds, talismans))
    const shareCode = encodeBuild(db, savedBuilds[0].build, talismans, '세팅')
    expect(extractShareCode(code)).toBeNull()
    expect(hasBackupCode(shareCode)).toBe(false)
    expect(hasBackupCode(`https://example.com/#b=${shareCode}`)).toBe(false)
  })

  it('잘리거나 망가진 코드는 ShareCodeError', async () => {
    // 내용이 고정돼야 망가뜨린 결과도 매번 같다
    const file = { ...createBackup(db, savedBuilds, talismans), exportedAt: '2026-10-22T00:00:00.000Z' }
    const code = await encodeBackupCode(file)
    const body = code.slice(code.indexOf('.') + 1)
    const middle = Math.floor(code.length / 2)
    const notJson = toBase64Url(new Uint8Array([0x4b, 0x4c, 0x04, 0x00])) // deflate-raw('abc')
    const cases = [
      '',
      body,
      'mhwilds-backup-1.',
      code.slice(0, middle),
      code.slice(0, middle) + (code[middle] === 'A' ? 'B' : 'A') + code.slice(middle + 1),
      `mhwilds-backup-1.${notJson}`,
      `mhwilds-backup-1.!!!`,
      code.replace('-1.', '-0.'),
    ]
    for (const text of cases) await expect(decodeBackupCode(text), text.slice(0, 30)).rejects.toThrow(ShareCodeError)
    await expect(decodeBackupCode(code.replace('-1.', '-2.'))).rejects.toThrow('더 새로운 형식의 백업 코드예요')
  })

  it('풀면 지나치게 커지는 코드는 끝까지 풀지 않고 거절한다', async () => {
    const zeros = new Blob([new Uint8Array(9 * 1024 * 1024)]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    const bomb = `mhwilds-backup-1.${toBase64Url(new Uint8Array(await new Response(zeros).arrayBuffer()))}`
    await expect(decodeBackupCode(bomb)).rejects.toThrow('올바른 백업 코드가 아니에요')
  })

  it('JSON 이지만 백업이 아니면 가져오기에서 ShareCodeError', async () => {
    const other = await decodeBackupCode(await encodeBackupCode({ app: 'other' } as unknown as BackupFile))
    expect(other).toEqual({ app: 'other' })
    expect(() => importBackup(db, other, empty, counter('id'))).toThrow(ShareCodeError)
  })
})
