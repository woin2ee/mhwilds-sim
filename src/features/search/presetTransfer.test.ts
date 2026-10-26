import { describe, expect, it } from 'vitest'
import { isGogmaArtian } from '../../core/gogmaArtian'
import { decodeBackupCode, encodeBackupCode, hasBackupCode, ShareCodeError, type BackupFile } from '../../core/share'
import type { CustomTalisman } from '../../core/types'
import { GameDb } from '../../data/db'
import { armorByName, loadTestDb, skillIdByName } from '../../test/testDb'
import { DEFAULT_CONDITIONS, normalizeConditions, type SearchConditions } from './conditions'
import type { ExcludedArmor } from './excludedArmor'
import { conditionsKey, newPreset, presetPart, type SearchPreset } from './presets'
import {
  createPresetsFile,
  decodePresetsCode,
  encodePresetsCode,
  hasPresetsCode,
  importPresets,
  isPresetsFile,
  type SearchPresetsFile,
} from './presetTransfer'

const db = loadTestDb()
const sid = (name: string) => skillIdByName(db, name)
const cond = (patch: Partial<SearchConditions>) => normalizeConditions({ ...DEFAULT_CONDITIONS, ...patch })
const gogmaWeapon = db.data.weapons.find(isGogmaArtian)!
const setSkill = db.data.skills.find((s) => s.kind === 'set')!
const groupSkill = db.data.skills.find((s) => s.kind === 'group')!
const fixedTalisman = db.data.talismans.find((t) => t.isMaxRank)!

const mine: CustomTalisman = {
  id: 'mine',
  name: '좋은 호석',
  rarity: 8,
  skills: [
    { skillId: sid('약점 특효'), level: 2 },
    { skillId: sid('공격'), level: 1 },
  ],
  slots: [
    { kind: 'weapon', level: 1 },
    { kind: 'armor', level: 2 },
  ],
}

/** 모든 필드를 기본값이 아닌 값으로 둔 조건 */
const everything = cond({
  required: [
    { skillId: sid('약점 특효'), level: 5, locked: true },
    { skillId: sid('도전자'), level: 3, off: true },
    { skillId: sid('간파'), level: 4 },
    { skillId: setSkill.id, level: 2 },
  ],
  requiredDividers: [{ id: 'line-1', kind: 'armor', index: 1 }],
  excluded: [sid('앙심'), sid('체술')],
  excludeMode: 'exclude',
  weaponMode: 'db',
  weaponKind: gogmaWeapon.kind,
  weaponId: gogmaWeapon.id,
  weaponSetSkillId: setSkill.id,
  weaponGroupSkillId: groupSkill.id,
  customWeaponSlots: [3, 1, 0],
  customWeaponSkills: [{ skillId: sid('간파'), level: 2 }],
  talismanMode: 'fixed',
  fixedTalisman: { type: 'custom', id: mine.id },
  includeLowRank: true,
  excludeHr100: true,
  transcend: true,
  useDecorations: false,
  spareSlots: { armor: [1, 0, 2], weapon: [0, 1, 0] },
  sort: 'defense',
  excludedArmor: [{ type: 'piece', id: db.data.armor[0].id }],
})

function counter(prefix: string): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}

const preset = (id: string, name: string, conditions: SearchConditions): SearchPreset => ({
  ...newPreset(name, conditions),
  id,
  updatedAt: '2026-10-25T00:00:00.000Z',
})
const roundTripJson = (file: SearchPresetsFile): unknown => JSON.parse(JSON.stringify(file))

type Here = Parameters<typeof importPresets>[2]
/** 가져오는 쪽 상태. 기본은 저장한 조건·제외 목록 없음, 내 호석은 mine */
const here = (patch: Partial<Here> = {}): Here => ({
  presets: [],
  customTalismans: [mine],
  excludedArmor: [],
  ...patch,
})
const empty = here()

describe('검색 조건 내보내기·가져오기', () => {
  const presets = [
    preset('a', '거극 대검', everything),
    preset('b', '활 속성', cond({ required: [{ skillId: sid('공격'), level: 3 }], talismanMode: 'none' })),
  ]

  it('내보낸 조건을 가져오면 모든 값이 그대로다 (정렬·제외할 방어구는 담지 않음)', () => {
    const file = createPresetsFile(db, presets, [mine])
    expect(file).toMatchObject({ app: 'mhwilds-sim', kind: 'search-presets', version: 1 })
    expect('sort' in file.presets[0].conditions).toBe(false)
    expect('excludedArmor' in file.presets[0].conditions).toBe(false)

    const result = importPresets(db, roundTripJson(file), empty, counter('id'))
    expect(result.added.map((p) => [p.id, p.name, p.updatedAt])).toEqual([
      ['id-1', '거극 대검', '2026-10-25T00:00:00.000Z'],
      ['id-2', '활 속성', '2026-10-25T00:00:00.000Z'],
    ])
    expect(result.entries.map((e) => e.missing)).toEqual([[], []])
    result.added.forEach((p, i) => {
      expect(p.conditions).toEqual(presetPart(normalizeConditions(presets[i].conditions)))
      expect(conditionsKey(p.conditions)).toBe(conditionsKey(presets[i].conditions))
    })
    expect(result.exportedAt).toBe(file.exportedAt)
  })

  it('스킬·무기·호석은 게임 내부 id 로 담아 MHDB id 가 바뀌어도 찾는다', () => {
    const file = createPresetsFile(db, presets.slice(0, 1), [mine])
    const exported = file.presets[0].conditions
    expect(exported.required[0].skillId).toBe(db.skill(sid('약점 특효')).gameId)
    expect(exported.weaponId).toBe(gogmaWeapon.gameId)
    expect(exported.fixedTalisman).toEqual({
      type: 'custom',
      talisman: {
        name: mine.name,
        rarity: mine.rarity,
        skills: mine.skills.map((p) => ({ ...p, skillId: db.skill(p.skillId).gameId })),
        slots: mine.slots,
      },
    })

    // 데이터를 다시 만들어 MHDB id 가 모두 바뀐 흉내
    const shift = 100_000
    const regenerated = new GameDb({
      ...db.data,
      skills: db.data.skills.map((s) => ({ ...s, id: s.id + shift })),
      weapons: db.data.weapons.map((w) => ({ ...w, id: w.id + shift })),
      talismans: db.data.talismans.map((t) => ({ ...t, id: t.id + shift })),
    })
    const myTalisman = { ...mine, skills: mine.skills.map((p) => ({ ...p, skillId: p.skillId + shift })) }
    const mineThere = here({ customTalismans: [myTalisman] })
    const result = importPresets(regenerated, roundTripJson(file), mineThere, counter('id'))
    const c = result.added[0].conditions
    expect(c.required.map((r) => r.skillId)).toEqual(everything.required.map((r) => r.skillId + shift))
    expect(c.excluded).toEqual(everything.excluded.map((id) => id + shift))
    expect([c.weaponId, c.weaponSetSkillId, c.weaponGroupSkillId]).toEqual(
      [gogmaWeapon.id, setSkill.id, groupSkill.id].map((id) => id + shift),
    )
    expect(c.customWeaponSkills).toEqual([{ skillId: sid('간파') + shift, level: 2 }])
    expect(c.fixedTalisman).toEqual({ type: 'custom', id: 'mine' })
    expect(result.entries[0].missing).toEqual([])

    const withFixed = cond({ talismanMode: 'fixed', fixedTalisman: { type: 'fixed', id: fixedTalisman.id } })
    const fixed = createPresetsFile(db, [preset('f', '제작 호석', withFixed)], [])
    expect(fixed.presets[0].conditions.fixedTalisman).toEqual({
      type: 'fixed',
      charmGameId: fixedTalisman.charmGameId,
      level: fixedTalisman.level,
    })
    const restored = importPresets(regenerated, roundTripJson(fixed), empty, counter('id'))
    expect(restored.added[0].conditions.fixedTalisman).toEqual({ type: 'fixed', id: fixedTalisman.id + shift })
  })

  it('같은 것을 다시 가져오면 모두 건너뛰고, 이름이나 조건이 다르면 더한다', () => {
    const file = roundTripJson(createPresetsFile(db, presets, [mine]))
    const first = importPresets(db, file, empty, counter('id'))
    const again = importPresets(db, file, here({ presets: first.presets }), counter('again'))
    expect(again.added).toEqual([])
    expect(again.entries.map((e) => e.exists)).toEqual([true, true])
    expect(again.presets).toEqual(first.presets)

    // 이 기기에 원래 있던 조건 (이름·조건이 같으면 꺼 둔 표시 모양이 달라도 같다)
    const offFalse = cond({ required: [{ skillId: sid('공격'), level: 3, off: false }], talismanMode: 'none' })
    const local = [preset('x', '활 속성', offFalse)]
    const partial = importPresets(db, file, here({ presets: local }), counter('id'))
    expect(partial.entries.map((e) => e.exists)).toEqual([false, true])
    expect(partial.presets.map((p) => p.name)).toEqual(['거극 대검', '활 속성'])

    const renamed = importPresets(db, file, here({ presets: [{ ...local[0], name: '활' }] }), counter('id'))
    expect(renamed.added.map((p) => p.name)).toEqual(['거극 대검', '활 속성'])
    expect(renamed.presets.map((p) => p.name)).toEqual(['거극 대검', '활 속성', '활'])

    // 한 파일 안에 같은 조건이 두 번 있으면 하나만
    const twice = createPresetsFile(db, [presets[1], presets[1]], [])
    const once = importPresets(db, roundTripJson(twice), empty, counter('id'))
    expect(once.entries.map((e) => e.exists)).toEqual([false, true])
  })

  it('고정한 내 호석은 내용이 같은 내 호석에 잇고(이름 무시), 없으면 비우고 알린다', () => {
    const file = roundTripJson(createPresetsFile(db, presets.slice(0, 1), [mine]))
    const other = { ...mine, id: 'other', name: '다른 이름', slots: [...mine.slots].reverse() }
    const linked = importPresets(db, file, here({ customTalismans: [other] }), counter('id'))
    expect(linked.added[0].conditions.fixedTalisman).toEqual({ type: 'custom', id: 'other' })

    const none = importPresets(db, file, here({ customTalismans: [] }), counter('id'))
    expect(none.added[0].conditions.fixedTalisman).toBeNull()
    expect(none.added[0].conditions.talismanMode).toBe('fixed')
    expect(none.entries[0].missing).toEqual(["고정 호석 '좋은 호석'(내 호석에 없음)"])
    expect(none.entries[0].talismanMissing).toBe(true)
    expect(linked.entries[0].talismanMissing).toBe(false)

    // 호석 모드가 고정이 아니면 조건에 남아 있기만 해서 알리지 않는다
    const auto = createPresetsFile(db, [preset('c', '자동', { ...everything, talismanMode: 'auto' })], [mine])
    const [unused] = importPresets(db, roundTripJson(auto), here({ customTalismans: [] }), counter('id')).entries
    expect([unused.missing, unused.talismanMissing]).toEqual([[], false])
  })

  it('현재 데이터에 없는 것은 비우고 조건마다 알린다', () => {
    const file = createPresetsFile(db, presets.slice(0, 1), [mine])
    const c = file.presets[0].conditions
    c.required[1].skillId = 123_456_789
    c.excluded.push(123_456_789)
    c.weaponId = 987_654
    c.weaponGroupSkillId = c.weaponSetSkillId // 그룹 자리에 시리즈 스킬
    const result = importPresets(db, roundTripJson(file), empty, counter('id'))
    const restored = result.added[0].conditions
    expect(restored.required.map((r) => r.skillId)).toEqual([sid('약점 특효'), sid('간파'), setSkill.id])
    expect(restored.excluded).toEqual(everything.excluded)
    expect([restored.weaponId, restored.weaponGroupSkillId]).toEqual([null, null])
    expect(result.entries[0].missing).toEqual(['원하는 스킬 1개', '비선호 스킬 1개', '무기', '무기 스킬 1개'])
  })

  it('예전에 저장한 조건(나중에 생긴 필드 없음)도 기본값을 채워 내보낸다', () => {
    const old = preset('old', '예전 조건', cond({ required: [{ skillId: sid('공격'), level: 3 }] }))
    const conditions: Partial<SearchConditions> = { ...old.conditions }
    delete conditions.requiredDividers
    delete conditions.excludeHr100
    delete conditions.spareSlots
    const file = createPresetsFile(db, [{ ...old, conditions: conditions as SearchPreset['conditions'] }], [])
    expect(file.presets[0].conditions).toMatchObject({
      requiredDividers: [],
      excludeHr100: false,
      spareSlots: { armor: [0, 0, 0], weapon: [0, 0, 0] },
    })
  })

  it('틀린 값은 기본값으로 읽고, 파일 모양이 틀리면 ShareCodeError', () => {
    const valid = roundTripJson(createPresetsFile(db, presets.slice(1), [])) as Record<string, unknown>
    const broken = structuredClone(valid) as { presets: { name: unknown; conditions: Record<string, unknown> }[] }
    Object.assign(broken.presets[0], { name: '   ' })
    Object.assign(broken.presets[0].conditions, {
      required: [{ skillId: db.skill(sid('공격')).gameId, level: 99 }, { skillId: 'x', level: 1 }, null],
      requiredDividers: [{ id: 1 }, { id: 'ok', kind: 'armor', index: 0 }],
      excludeMode: 'deprioritize',
      weaponMode: 'laser',
      weaponKind: 'spoon',
      customWeaponSlots: [9, -1, 'x'],
      talismanMode: 1,
      fixedTalisman: { type: 'unknown' },
      transcend: 'yes',
      spareSlots: { armor: [9, 'x', 1.5], weapon: null },
      futureField: true,
    })
    const result = importPresets(db, broken, empty, counter('id'))
    expect(result.added[0].name).toBe('이름 없는 조건')
    expect(result.added[0].conditions).toEqual(
      presetPart(
        cond({
          required: [{ skillId: sid('공격'), level: db.skill(sid('공격')).maxLevel }],
          requiredDividers: [{ id: 'ok', kind: 'armor', index: 0 }],
          customWeaponSlots: [3, 0, 0],
          spareSlots: { armor: [5, 0, 0], weapon: [0, 0, 0] },
        }),
      ),
    )
    expect(result.entries[0].missing).toEqual(['원하는 스킬 2개'])

    const cases: unknown[] = [
      null,
      'text',
      [],
      {},
      { ...valid, app: 'other' },
      { ...valid, kind: 'backup' },
      { ...valid, presets: 'x' },
      { ...valid, presets: [null] },
      { ...valid, presets: [{ name: '조건 없음' }] },
    ]
    for (const input of cases) expect(() => importPresets(db, input, empty, counter('id'))).toThrow(ShareCodeError)
    expect(() => importPresets(db, { ...valid, version: 2 }, empty, counter('id'))).toThrow('더 새로운 형식의 검색 조건이에요')
    expect(() => importPresets(db, { ...valid, version: '1' }, empty, counter('id'))).toThrow('올바른 검색 조건 파일이 아니에요')
  })
})

describe('제외할 방어구도 내보내기·가져오기', () => {
  const helm = armorByName(db, '슈바르카헬름γ')
  const conga = armorByName(db, '콩가헬름α')
  const setGameId = (setId: number) => db.armorSets.get(setId)!.gameId
  const excluded: ExcludedArmor[] = [
    { type: 'piece', id: helm.id },
    { type: 'set', id: conga.setId },
  ]

  it('고르면 지금 제외 목록을 조건과 따로 게임 내부 id 로 담고, 고르지 않으면 담지 않는다', () => {
    const file = createPresetsFile(db, [], [], excluded)
    expect(file.excludedArmor).toEqual([
      { type: 'piece', setGameId: setGameId(helm.setId), kind: helm.kind },
      { type: 'set', setGameId: setGameId(conga.setId) },
    ])
    const result = importPresets(db, roundTripJson(file), empty, counter('id'))
    expect(result.entries).toEqual([])
    expect(result.excludedArmor).toEqual({ entries: excluded, merged: excluded, added: 2, missing: 0 })

    const without = createPresetsFile(db, [], [])
    expect('excludedArmor' in without).toBe(false)
    expect(importPresets(db, roundTripJson(without), empty, counter('id')).excludedArmor).toBeNull()
  })

  it('지금 목록에 더한다: 이미 다 빠진 것은 그대로, 새로 넣는 세트 안에 드는 방어구 칩은 합친다', () => {
    const file = roundTripJson(createPresetsFile(db, [], [], excluded))
    const series: ExcludedArmor = { type: 'series', id: helm.setId }
    const current: ExcludedArmor[] = [{ type: 'piece', id: conga.id }, series]
    const result = importPresets(db, file, here({ excludedArmor: current }), counter('id')).excludedArmor!
    expect(result.merged).toEqual([series, { type: 'set', id: conga.setId }])
    expect(result.added).toBe(1)

    const again = importPresets(db, file, here({ excludedArmor: result.merged }), counter('id')).excludedArmor!
    expect([again.merged, again.added]).toEqual([result.merged, 0])
  })

  it('MHDB id 가 바뀌어도 찾고, 틀리거나 없는 항목은 빼고 센다', () => {
    const file = createPresetsFile(db, [], [], excluded)
    const shift = 100_000
    const regenerated = new GameDb({
      ...db.data,
      armor: db.data.armor.map((a) => ({ ...a, id: a.id + shift, setId: a.setId + shift })),
      armorSets: db.data.armorSets.map((s) => ({
        ...s,
        id: s.id + shift,
        pieceIds: s.pieceIds.map((id) => id + shift),
      })),
    })
    const moved = importPresets(regenerated, roundTripJson(file), empty, counter('id')).excludedArmor!
    expect(moved.entries).toEqual(excluded.map((e) => ({ ...e, id: e.id + shift })))

    const junk = [
      { type: 'piece', setGameId: 1, kind: 'tail' },
      { type: 'set', setGameId: 123_456_789 },
      { type: 'series' },
      null,
      'x',
    ]
    const broken = { ...file, excludedArmor: [...file.excludedArmor!, ...junk] }
    const result = importPresets(db, broken, empty, counter('id'))
    expect(result.excludedArmor).toMatchObject({ entries: excluded, added: 2, missing: 5 })
    expect(importPresets(db, { ...file, excludedArmor: 'x' }, empty, counter('id')).excludedArmor).toBeNull()
  })
})

describe('검색 조건 코드', () => {
  const presets = [preset('a', '거극 대검', everything)]

  it('코드로 옮겨도 파일과 똑같이 가져온다', async () => {
    const file = createPresetsFile(db, presets, [mine])
    const code = await encodePresetsCode(file)
    expect(code).toMatch(/^mhwilds-search-1\.[A-Za-z0-9_-]+$/)
    const wrapped = `검색 조건\n${code.replace(/(.{40})/g, '$1\n ')}`
    expect(hasPresetsCode(wrapped)).toBe(true)
    expect(await decodePresetsCode(wrapped)).toEqual(roundTripJson(file))
    expect(importPresets(db, await decodePresetsCode(code), empty, counter('id'))).toEqual(
      importPresets(db, roundTripJson(file), empty, counter('id')),
    )
  })

  it('백업 코드·파일과 섞이지 않는다', async () => {
    const code = await encodePresetsCode(createPresetsFile(db, presets, [mine]))
    const backup = { app: 'mhwilds-sim', kind: 'backup', version: 1, talismans: [], builds: [] } as unknown as BackupFile
    const backupCode = await encodeBackupCode(backup)
    expect(hasBackupCode(code)).toBe(false)
    expect(hasPresetsCode(backupCode)).toBe(false)
    await expect(decodeBackupCode(code)).rejects.toThrow('올바른 백업 코드가 아니에요')
    await expect(decodePresetsCode(backupCode)).rejects.toThrow('올바른 검색 조건 코드가 아니에요')
    await expect(decodePresetsCode(code.replace('-1.', '-2.'))).rejects.toThrow('더 새로운 형식의 검색 조건 코드예요')
    await expect(decodePresetsCode(code.slice(0, code.length / 2))).rejects.toThrow(ShareCodeError)
    expect(isPresetsFile(await decodePresetsCode(code))).toBe(true)
    expect(isPresetsFile(backup)).toBe(false)
  })
})
