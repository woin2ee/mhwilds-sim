import { describe, expect, it } from 'vitest'
import { isGogmaArtian } from '../../core/gogmaArtian'
import { hr100ArmorIds, isHr100Talisman } from '../../core/hunterRank'
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
    expect(c.excludeMode).toBe('mark')
    expect(c.useDecorations).toBe(true)
    expect(c.customWeaponSlots).toEqual([3, 0, 0])
  })

  it('거극 아티어 무기일 때만 고른 시리즈·그룹 스킬을 요청 무기에 담는다', () => {
    const hunger = skillIdByName(db, '쇄인룡의 굶주림')
    const lordsSoul = skillIdByName(db, '주인의 혼')
    const gogma = db.weaponByGameKey('great-sword', 87)!
    const other = db.data.weapons.find((w) => w.kind === 'great-sword' && !isGogmaArtian(w))!
    const withSkills = { weaponMode: 'db', weaponSetSkillId: hunger, weaponGroupSkillId: lordsSoul } as const
    expect(buildRequest(db, cond({ ...withSkills, weaponId: gogma.id }), []).weapon.choice).toEqual({
      type: 'db',
      id: gogma.id,
      setSkillId: hunger,
      groupSkillId: lordsSoul,
    })
    // 다른 무기를 고르면 조건에 남은 스킬은 요청에 넣지 않아, 스킬을 고른 적 없는 요청과 같다
    const otherRequest = buildRequest(db, cond({ ...withSkills, weaponId: other.id }), [])
    expect(otherRequest.weapon.choice).toEqual({ type: 'db', id: other.id })
    const never = buildRequest(db, cond({ weaponMode: 'db', weaponId: other.id }), [])
    expect(requestKey(otherRequest)).toBe(requestKey(never))
  })

  it('슬롯 직접 지정에도 거극 아티어 스킬을 담는다', () => {
    const hunger = skillIdByName(db, '쇄인룡의 굶주림')
    const c = cond({ weaponMode: 'custom', customWeaponSlots: [3, 0, 3], weaponSetSkillId: hunger })
    expect(buildRequest(db, c, []).weapon.choice).toEqual({ type: 'custom', slots: [3, 3], skills: [], setSkillId: hunger })
    // 무기 미지정이면 넣지 않는다
    expect(buildRequest(db, cond({ weaponMode: 'none', weaponSetSkillId: hunger }), []).weapon.choice).toBeNull()
  })

  it('저장값의 거극 아티어 스킬이 정수가 아니면 비운다', () => {
    const empty = { weaponSetSkillId: null, weaponGroupSkillId: null }
    const stored = { required: [], excluded: [], weaponSetSkillId: '3', weaponGroupSkillId: 1.5 } as unknown
    expect(normalizeConditions(stored as Partial<SearchConditions>)).toMatchObject(empty)
    expect(normalizeConditions({ required: [], excluded: [] })).toMatchObject(empty)
  })

  it('예전 비선호 모드 저장값(deprioritize)은 mark 로 읽는다', () => {
    const stored = { required: [], excluded: [], excludeMode: 'deprioritize' } as unknown as Partial<SearchConditions>
    expect(normalizeConditions(stored).excludeMode).toBe('mark')
    expect(normalizeConditions({ required: [], excluded: [], excludeMode: 'exclude' }).excludeMode).toBe('exclude')
  })

  it('장식주 없이 찾기는 요청에 그대로 넘기고, 바꾸면 요청 키가 달라진다', () => {
    const withDecorations = buildRequest(db, cond({}), [])
    const without = buildRequest(db, cond({ useDecorations: false }), [])
    expect(withDecorations.useDecorations).toBe(true)
    expect(without.useDecorations).toBe(false)
    expect(requestKey(without)).not.toBe(requestKey(withDecorations))
  })

  it('HR 100 장비 제외는 그 방어구 id 를 excludedArmorIds 로 넘기고, 바꾸면 요청 키가 달라진다', () => {
    const off = buildRequest(db, cond({}), [])
    const on = buildRequest(db, cond({ excludeHr100: true }), [])
    expect(off.excludedArmorIds).toEqual([])
    expect(on.excludedArmorIds).toEqual(hr100ArmorIds(db))
    expect(on.excludedArmorIds.length).toBeGreaterThan(0)
    expect(requestKey(on)).not.toBe(requestKey(off))
  })

  it('HR 100 장비 제외면 자동 호석은 계열마다 HR 100 전에 만들 수 있는 가장 높은 등급 (예: 통격의 호석Ⅲ → Ⅱ)', () => {
    const fixedOf = (excludeHr100: boolean) =>
      buildRequest(db, cond({ talismanMode: 'auto', excludeHr100 }), []).talismans.flatMap((t) =>
        t.ref.type === 'fixed' ? [db.talismans.get(t.ref.id)!] : [],
      )
    const off = fixedOf(false)
    const on = fixedOf(true)
    expect(on).toHaveLength(off.length)
    expect(on.some(isHr100Talisman)).toBe(false)
    expect(off.map((t) => t.name.ko)).toContain('통격의 호석Ⅲ')
    expect(on.map((t) => t.name.ko)).not.toContain('통격의 호석Ⅲ')
    expect(on.map((t) => t.name.ko)).toContain('통격의 호석Ⅱ')
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
