import { describe, expect, it } from 'vitest'
import type { CustomTalisman } from '../../core/types'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import { DEFAULT_CONDITIONS, buildRequest, normalizeConditions, requestKey, type SearchConditions } from './conditions'

const db = loadTestDb()
const myTalisman: CustomTalisman = {
  id: 'mine',
  name: '감정 호석',
  rarity: 8,
  skills: [{ skillId: skillIdByName(db, '공격'), level: 2 }],
  slots: [
    { kind: 'weapon', level: 1 },
    { kind: 'armor', level: 1 },
  ],
}

const cond = (patch: Partial<SearchConditions>) => normalizeConditions({ ...DEFAULT_CONDITIONS, ...patch })

describe('검색 조건 → SearchRequest', () => {
  it('저장된 값에 빠진 필드는 기본값으로 채우고 슬롯 값은 0~3으로 자른다', () => {
    const c = normalizeConditions({ required: [], excluded: [], customWeaponSlots: [5, -1] })
    expect(c.excludeMode).toBe('deprioritize')
    expect(c.useDecorations).toBe(true)
    expect(c.customWeaponSlots).toEqual([3, 0, 0])
  })

  it('장식주 없이 찾기는 요청에 그대로 넘기고, 바꾸면 요청 키가 달라진다', () => {
    const withDecorations = buildRequest(db, cond({}), [])
    const without = buildRequest(db, cond({ useDecorations: false }), [])
    expect(withDecorations.useDecorations).toBe(true)
    expect(without.useDecorations).toBe(false)
    expect(requestKey(without)).not.toBe(requestKey(withDecorations))
  })

  it('자동 호석 = 제작 호석 최고 등급 + 내 호석 (슬롯 포함)', () => {
    const request = buildRequest(db, cond({ talismanMode: 'auto' }), [myTalisman])
    const maxRank = db.data.talismans.filter((t) => t.isMaxRank).length
    expect(request.talismans).toHaveLength(maxRank + 1)
    expect(request.talismans.at(-1)).toEqual({ ref: { type: 'custom', id: 'mine' }, skills: myTalisman.skills, slots: myTalisman.slots })
  })

  it('호석 모드: 내 호석만 / 고정 / 없음', () => {
    expect(buildRequest(db, cond({ talismanMode: 'custom-only' }), []).talismans).toEqual([])
    const fixed = db.data.talismans[0]
    const one = buildRequest(db, cond({ talismanMode: 'fixed', fixedTalisman: { type: 'fixed', id: fixed.id } }), [])
    expect(one.talismans.map((t) => t.ref)).toEqual([{ type: 'fixed', id: fixed.id }])
    expect(buildRequest(db, cond({ talismanMode: 'fixed', fixedTalisman: null }), []).talismans).toEqual([])
    expect(buildRequest(db, cond({ talismanMode: 'none' }), [myTalisman]).talismans).toEqual([])
  })

  it('무기: DB 무기는 스킬·슬롯을 풀고, 직접 지정은 빈 칸을 빼고 내림차순', () => {
    const weapon = db.data.weapons.find((w) => w.skills.length > 0 && w.slots.length > 0)!
    const fromDb = buildRequest(db, cond({ weaponMode: 'db', weaponKind: weapon.kind, weaponId: weapon.id }), [])
    expect(fromDb.weapon).toEqual({ choice: { type: 'db', id: weapon.id }, skills: weapon.skills, slots: weapon.slots })

    const custom = buildRequest(db, cond({ weaponMode: 'custom', customWeaponSlots: [1, 0, 3] }), [])
    expect(custom.weapon.slots).toEqual([3, 1])
    expect(custom.weapon.choice).toEqual({ type: 'custom', slots: [3, 1], skills: [] })

    const none = buildRequest(db, cond({ weaponMode: 'db', weaponId: null }), [])
    expect(none.weapon).toEqual({ choice: null, skills: [], slots: [] })
  })

  it('없는 스킬 id 는 요청에서 빠지고, 정렬만 다른 요청은 같은 키', () => {
    const attack = skillIdByName(db, '공격')
    const request = buildRequest(
      db,
      cond({ required: [{ skillId: attack, level: 3 }, { skillId: 999999, level: 1 }], excluded: [999999] }),
      [],
    )
    expect(request.required).toEqual([{ skillId: attack, level: 3 }])
    expect(request.excludedSkills).toEqual([])
    expect(requestKey({ ...request, sort: 'defense' })).toBe(requestKey({ ...request, sort: 'slots' }))
  })

  it('꺼 둔 원하는 스킬은 요청에서 빠지고, 다시 켜면 처음 요청과 같은 키', () => {
    const attack = skillIdByName(db, '공격')
    const crit = skillIdByName(db, '간파')
    const request = (off?: boolean) =>
      buildRequest(db, cond({ required: [{ skillId: attack, level: 3, off }, { skillId: crit, level: 2 }] }), [])
    expect(request(true).required).toEqual([{ skillId: crit, level: 2 }])
    expect(requestKey(request(true))).not.toBe(requestKey(request()))
    expect(requestKey(request(false))).toBe(requestKey(request()))
  })
})
