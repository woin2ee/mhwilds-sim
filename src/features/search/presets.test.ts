import { describe, expect, it } from 'vitest'
import { nameOf } from '../../data/db'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import { DEFAULT_CONDITIONS, normalizeConditions, type SearchConditions } from './conditions'
import {
  conditionsKey,
  editPresetInfo,
  newPreset,
  overwritePreset,
  presetConditions,
  presetSummary,
  presetWeaponKind,
  saveToPreset,
  suggestPresetName,
  validPresets,
} from './presets'

const db = loadTestDb()
const sid = (name: string) => skillIdByName(db, name)
const cond = (patch: Partial<SearchConditions>) => normalizeConditions({ ...DEFAULT_CONDITIONS, ...patch })
const greatSword = db.data.weapons.find((w) => w.kind === 'great-sword')!
const bow = db.data.weapons.find((w) => w.kind === 'bow')!
const withGreatSword = { weaponMode: 'db', weaponKind: 'great-sword', weaponId: greatSword.id } as const

describe('검색 조건 저장', () => {
  it('저장할 때 정렬은 빼고, 불러올 때 지금 정렬을 둔다', () => {
    const saved = newPreset('  대검 회심  ', cond({ required: [{ skillId: sid('약점 특효'), level: 5 }], sort: 'defense' }))
    expect(saved.name).toBe('대검 회심')
    expect('sort' in saved.conditions).toBe(false)
    const loaded = presetConditions(saved, cond({ sort: 'slots' }))
    expect(loaded.sort).toBe('slots')
    expect(loaded.required).toEqual([{ skillId: sid('약점 특효'), level: 5 }])
    expect(newPreset('   ', cond({})).name).toBe('이름 없는 조건')
  })

  it('제외할 방어구는 저장하지 않고 불러와도 지금 목록을 두며, 같은 조건인지 볼 때도 뺀다', () => {
    const mine = cond({ excludedArmor: [{ type: 'series', id: db.data.armorSets[0].id }] })
    const saved = newPreset('제외 있음', mine)
    expect('excludedArmor' in saved.conditions).toBe(false)
    expect(overwritePreset(saved, mine).conditions).not.toHaveProperty('excludedArmor')
    const now = cond({ excludedArmor: [{ type: 'piece', id: db.data.armor[0].id }] })
    expect(presetConditions(saved, now).excludedArmor).toEqual(now.excludedArmor)
    expect(conditionsKey(now)).toBe(conditionsKey(saved.conditions))
  })

  it('저장한 뒤 생긴 필드는 불러올 때 기본값으로 채운다', () => {
    const old = newPreset('예전 조건', cond({}))
    const conditions: Partial<SearchConditions> = { ...old.conditions }
    delete conditions.weaponSetSkillId
    delete conditions.excludeHr100
    delete conditions.spareSlots
    const loaded = presetConditions({ ...old, conditions: conditions as typeof old.conditions }, cond({}))
    expect(loaded.weaponSetSkillId).toBeNull()
    expect(loaded.excludeHr100).toBe(false)
    expect(loaded.spareSlots).toEqual({ armor: [0, 0, 0], weapon: [0, 0, 0] })
    // 예전 조건은 장식주 여유분이 없는 지금 조건과 같은 조건이다 (불러오기만 해서는 자동 저장으로 바뀌지 않는다)
    expect(conditionsKey(conditions)).toBe(conditionsKey(cond({})))
  })

  it('장식주 여유분은 저장한 조건에 담고, 다르면 다른 조건이다', () => {
    const spare = cond({ spareSlots: { armor: [0, 0, 2], weapon: [0, 0, 0] } })
    const saved = newPreset('여유분', spare)
    expect(saved.conditions.spareSlots).toEqual({ armor: [0, 0, 2], weapon: [0, 0, 0] })
    expect(presetConditions(saved, cond({})).spareSlots).toEqual(spare.spareSlots)
    expect(conditionsKey(spare)).not.toBe(conditionsKey(cond({})))
  })

  it('내성 조건은 저장한 조건에 담고, 속성을 넣은 순서와 상관없이 같은 조건이다', () => {
    const a = cond({ minResistances: { dragon: 5, fire: 0 } })
    const b = cond({ minResistances: { fire: 0, dragon: 5 } })
    expect(newPreset('내성', a).conditions.minResistances).toEqual({ fire: 0, dragon: 5 })
    expect(conditionsKey({ ...a, minResistances: { dragon: 5, fire: 0 } })).toBe(conditionsKey(b))
    expect(conditionsKey(cond({ minResistances: { fire: 1, dragon: 5 } }))).not.toBe(conditionsKey(b))
  })

  it('같은 조건 키: 정렬·꺼 둔 표시가 없는 것과 false·필드 순서는 무시하고, 레벨이 다르면 다르다', () => {
    const crit = sid('약점 특효')
    const base = cond({ required: [{ skillId: crit, level: 5 }] })
    expect(conditionsKey({ ...base, sort: 'defense' })).toBe(conditionsKey(base))
    expect(conditionsKey({ ...base, required: [{ level: 5, skillId: crit, off: false, locked: false }] })).toBe(
      conditionsKey(base),
    )
    expect(conditionsKey({ ...base, required: [{ skillId: crit, level: 4 }] })).not.toBe(conditionsKey(base))
    expect(conditionsKey({ ...base, required: [{ skillId: crit, level: 5, locked: true }] })).not.toBe(conditionsKey(base))
  })

  it('덮어쓰면 조건을 바꾸고, 이름을 비우면 원래 이름을 둔다', () => {
    const saved = newPreset('활 속성', cond({}))
    const next = overwritePreset(saved, cond({ includeLowRank: true }), ' ')
    expect(next.id).toBe(saved.id)
    expect(next.name).toBe('활 속성')
    expect(next.conditions.includeLowRank).toBe(true)
  })

  it('자동 저장: 사용 중인 조건만 지금 조건으로 바꾸고, 이미 같거나 그 조건이 없으면 저장값을 그대로 둔다', () => {
    const crit = sid('약점 특효')
    const greatSwordPreset = newPreset('대검', cond({ required: [{ skillId: crit, level: 5 }] }))
    const bow = newPreset('활', cond({}))
    const stored = [greatSwordPreset, bow]
    const edited = cond({ required: [{ skillId: crit, level: 4 }], sort: 'defense' })
    const next = saveToPreset(stored, greatSwordPreset.id, edited)
    expect(next[0]).toMatchObject({ id: greatSwordPreset.id, name: '대검' })
    expect(next[0].conditions.required).toEqual([{ skillId: crit, level: 4 }])
    expect(next[0].conditions).not.toHaveProperty('sort')
    expect(next[1]).toBe(bow)
    // 저장하지 않는 정렬·제외할 방어구만 바뀌었으면 같은 조건이라 저장값(배열)이 그대로다
    const sortOnly = {
      ...presetConditions(greatSwordPreset, cond({})),
      sort: 'defense' as const,
      excludedArmor: [{ type: 'piece' as const, id: db.data.armor[0].id }],
    }
    expect(saveToPreset(stored, greatSwordPreset.id, sortOnly)).toBe(stored)
    expect(saveToPreset(next, greatSwordPreset.id, edited)).toBe(next)
    expect(saveToPreset(stored, 'gone', edited)).toBe(stored)
    // 저장할 때 형식이 깨진 항목은 뺀다 (다른 저장과 같게)
    const broken = [...stored, null] as typeof stored
    expect(saveToPreset(broken, bow.id, edited).map((p) => p.id)).toEqual([greatSwordPreset.id, bow.id])
  })

  it('무기 종류: 조건에서 고른 무기의 종류가 먼저고, 무기를 고르지 않았으면 저장할 때 고른 종류', () => {
    const saved = newPreset('대검', cond(withGreatSword), 'bow')
    expect(saved.weaponKind).toBe('great-sword')
    expect(presetWeaponKind(saved)).toBe('great-sword')
    // 무기 종류만 고르고 무기는 아직 안 골랐거나, 슬롯 직접 지정·무기 미지정이면 고른 종류
    const kindOnly = cond({ ...withGreatSword, weaponId: null })
    expect(presetWeaponKind(newPreset('활', kindOnly, 'bow'))).toBe('bow')
    const custom = cond({ weaponMode: 'custom', customWeaponSlots: [3, 3, 0] })
    expect(presetWeaponKind(newPreset('아티어 태도', custom, 'long-sword'))).toBe('long-sword')
    const none = newPreset('미지정', cond({}))
    expect(presetWeaponKind(none)).toBeNull()
    expect(none).not.toHaveProperty('weaponKind')
    // 저장값의 모르는 종류(다른 버전의 무기 등)는 미지정
    expect(presetWeaponKind({ ...none, weaponKind: 'chainsaw' as never })).toBeNull()
  })

  it('무기 종류: 고쳐 저장하면 고른 무기의 종류로 바꾸고, 무기를 빼도 마지막 무기의 종류가 남는다', () => {
    const saved = newPreset('대검', cond(withGreatSword))
    const toBow = overwritePreset(saved, cond({ weaponMode: 'db', weaponKind: 'bow', weaponId: bow.id }))
    expect(presetWeaponKind(toBow)).toBe('bow')
    expect(presetWeaponKind(overwritePreset(toBow, cond({ ...withGreatSword, weaponMode: 'custom' })))).toBe('bow')
    expect(presetWeaponKind(overwritePreset(toBow, cond({})))).toBe('bow')
    // 종류를 담기 전에 저장한 조건도 무기를 빼면 그 전 무기의 종류를 담는다
    const old = { ...saved }
    delete old.weaponKind
    const dropped = overwritePreset(old, cond({}))
    expect(dropped.weaponKind).toBe('great-sword')
    // 자동 저장도 같다 (무기를 빼도 목록의 다른 종류로 옮겨 가지 않는다)
    expect(saveToPreset([old], old.id, cond({ weaponMode: 'none' }))[0].weaponKind).toBe('great-sword')
    // 고른 종류는 무기를 고르지 않는 동안 그대로다
    const custom = newPreset('아티어', cond({ weaponMode: 'custom' }), 'long-sword')
    expect(overwritePreset(custom, cond({ weaponMode: 'custom', includeLowRank: true })).weaponKind).toBe('long-sword')
    expect(overwritePreset(newPreset('없음', cond({})), cond({ includeLowRank: true }))).not.toHaveProperty('weaponKind')
  })

  it('정보 수정: 이름·무기 종류를 바꾸고 고친 시각을 바꾼다. 무기를 고른 조건의 종류는 바꾸지 않는다', () => {
    const before = '2026-01-01T00:00:00.000Z'
    const custom = { ...newPreset('직접 지정', cond({ weaponMode: 'custom' })), updatedAt: before }
    const edited = editPresetInfo(custom, '  아티어 태도 ', 'long-sword')
    expect(edited).toMatchObject({ id: custom.id, name: '아티어 태도', weaponKind: 'long-sword' })
    expect(edited.updatedAt).not.toBe(before)
    expect(edited.conditions).toBe(custom.conditions)
    // 이름을 비우면 원래 이름, 미지정으로 되돌리면 키를 뺀다
    const cleared = editPresetInfo(edited, ' ', null)
    expect(cleared.name).toBe('아티어 태도')
    expect(cleared).not.toHaveProperty('weaponKind')
    // 바뀐 것이 없으면 그대로 (고친 시각도 그대로)
    expect(editPresetInfo(edited, '아티어 태도', 'long-sword')).toBe(edited)
    const withWeapon = newPreset('대검', cond(withGreatSword))
    expect(editPresetInfo(withWeapon, '대검', 'bow')).toBe(withWeapon)
    const renamed = editPresetInfo(withWeapon, '대검 회심', 'bow')
    expect(renamed.name).toBe('대검 회심')
    expect(presetWeaponKind(renamed)).toBe('great-sword')
  })

  it('저장값에서 형식이 맞지 않는 항목만 뺀다', () => {
    const ok = newPreset('정상', cond({}))
    expect(validPresets([ok, { id: 1, name: 'x' }, null, { id: 'y', name: 'y', conditions: {} }])).toEqual([ok])
    expect(validPresets('broken')).toEqual([])
  })

  it('기본 이름은 무기 종류 + 앞쪽 원하는 스킬 2개, 요약은 무기 이름 + 3개 외 N개', () => {
    const required = [
      { skillId: sid('약점 특효'), level: 5 },
      { skillId: sid('도전자'), level: 5, off: true },
      { skillId: sid('연격'), level: 3 },
      { skillId: sid('회피 성능'), level: 2 },
      { skillId: sid('체술'), level: 1 },
    ]
    const withWeapon = cond({ required, ...withGreatSword })
    expect(suggestPresetName(db, withWeapon)).toBe('대검 · 약점 특효5 · 연격3')
    expect(presetSummary(db, withWeapon)).toBe(`${nameOf(greatSword.name)} · 약점 특효5 · 연격3 · 회피 성능2 외 1개`)
    expect(suggestPresetName(db, cond({ required }))).toBe('약점 특효5 · 연격3')
    expect(suggestPresetName(db, cond({}))).toBe('새 조건')
    expect(presetSummary(db, cond({}))).toBe('무기 미지정 · 원하는 스킬 없음')
    expect(presetSummary(db, cond({ weaponMode: 'custom' }))).toBe('슬롯 직접 지정 · 원하는 스킬 없음')
  })
})
