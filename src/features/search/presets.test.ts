import { describe, expect, it } from 'vitest'
import { nameOf } from '../../data/db'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import { DEFAULT_CONDITIONS, normalizeConditions, type SearchConditions } from './conditions'
import {
  conditionsKey,
  newPreset,
  overwritePreset,
  presetConditions,
  presetSummary,
  suggestPresetName,
  validPresets,
} from './presets'

const db = loadTestDb()
const sid = (name: string) => skillIdByName(db, name)
const cond = (patch: Partial<SearchConditions>) => normalizeConditions({ ...DEFAULT_CONDITIONS, ...patch })
const greatSword = db.data.weapons.find((w) => w.kind === 'great-sword')!

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
    // 예전 조건은 장식주 여유분이 없는 지금 조건과 같은 조건이다 ('수정됨'이 붙지 않는다)
    expect(conditionsKey(conditions)).toBe(conditionsKey(cond({})))
  })

  it('장식주 여유분은 저장한 조건에 담고, 다르면 다른 조건이다', () => {
    const spare = cond({ spareSlots: { armor: [0, 0, 2], weapon: [0, 0, 0] } })
    const saved = newPreset('여유분', spare)
    expect(saved.conditions.spareSlots).toEqual({ armor: [0, 0, 2], weapon: [0, 0, 0] })
    expect(presetConditions(saved, cond({})).spareSlots).toEqual(spare.spareSlots)
    expect(conditionsKey(spare)).not.toBe(conditionsKey(cond({})))
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
    const withWeapon = cond({ required, weaponMode: 'db', weaponKind: 'great-sword', weaponId: greatSword.id })
    expect(suggestPresetName(db, withWeapon)).toBe('대검 · 약점 특효5 · 연격3')
    expect(presetSummary(db, withWeapon)).toBe(`${nameOf(greatSword.name)} · 약점 특효5 · 연격3 · 회피 성능2 외 1개`)
    expect(suggestPresetName(db, cond({ required }))).toBe('약점 특효5 · 연격3')
    expect(suggestPresetName(db, cond({}))).toBe('새 조건')
    expect(presetSummary(db, cond({}))).toBe('무기 미지정 · 원하는 스킬 없음')
    expect(presetSummary(db, cond({ weaponMode: 'custom' }))).toBe('슬롯 직접 지정 · 원하는 스킬 없음')
  })
})
