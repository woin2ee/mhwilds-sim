import { describe, expect, it } from 'vitest'
import { isGogmaArtian } from '../../core/gogmaArtian'
import { hr100ArmorIds, isHr100Talisman } from '../../core/hunterRank'
import type { CustomTalisman } from '../../core/types'
import type { SkillKind, SkillPoint } from '../../data/types'
import { armorByName, loadTestDb, skillIdByName } from '../../test/testDb'
import {
  DEFAULT_CONDITIONS,
  applyRequiredLayout,
  buildRequest,
  normalizeConditions,
  requestKey,
  requiredLayout,
  sortRequired,
  withRequiredOrder,
  type RequiredDivider,
  type RequiredItem,
  type SearchConditions,
} from './conditions'

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

  it('제외할 방어구는 펼쳐서 HR 100 장비와 합쳐 id 순으로 넘기고, 같은 방어구를 빼면 넣은 방식이 달라도 같은 요청', () => {
    const gamma = db.data.armorSets.find((s) => s.name.ko === '슈바르카γ')!
    const reyDau = armorByName(db, '레다젤트헬름α').id
    const bySet = buildRequest(db, cond({ excludedArmor: [{ type: 'set', id: gamma.id }] }), [])
    expect(bySet.excludedArmorIds).toEqual([...gamma.pieceIds].sort((a, b) => a - b))
    const byPieces = buildRequest(db, cond({ excludedArmor: gamma.pieceIds.map((id) => ({ type: 'piece', id })) }), [])
    expect(requestKey(byPieces)).toBe(requestKey(bySet))
    expect(requestKey(bySet)).not.toBe(requestKey(buildRequest(db, cond({}), [])))
    // 슈바르카γ 는 HR 100 장비라 겹친다
    const withHr100 = buildRequest(
      db,
      cond({ excludeHr100: true, excludedArmor: [{ type: 'set', id: gamma.id }, { type: 'piece', id: reyDau }] }),
      [],
    )
    expect(withHr100.excludedArmorIds).toEqual([...hr100ArmorIds(db), reyDau].sort((a, b) => a - b))
  })

  it('제외할 방어구 저장값은 모양이 맞는 것만 남기고, 예전 저장값엔 없음', () => {
    const stored = (excludedArmor: unknown) =>
      normalizeConditions({ required: [], excluded: [], excludedArmor } as unknown as Partial<SearchConditions>)
    const broken = [{ type: 'x', id: 1 }, { type: 'piece', id: '2' }, { type: 'series', id: 1.5 }, null]
    expect(stored([{ type: 'set', id: 3 }, ...broken]).excludedArmor).toEqual([{ type: 'set', id: 3 }])
    expect(stored('broken').excludedArmor).toEqual([])
    expect(normalizeConditions({ required: [], excluded: [] }).excludedArmor).toEqual([])
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

  it('고정한 원하는 스킬은 id 순으로 lockedSkills 에 담고, 꺼 둔 스킬은 고정해도 빠진다', () => {
    const [attack, crit, weakness] = ['공격', '간파', '약점 특효'].map((name) => skillIdByName(db, name))
    const request = buildRequest(
      db,
      cond({
        required: [
          { skillId: weakness, level: 5, locked: true },
          { skillId: crit, level: 2, locked: true, off: true },
          { skillId: attack, level: 3, locked: true },
        ],
      }),
      [],
    )
    expect(request.lockedSkills).toEqual([attack, weakness].sort((a, b) => a - b))
    expect(request.maxShortfall).toBeGreaterThan(0)
    const unlocked = buildRequest(db, cond({ required: [{ skillId: attack, level: 3 }, { skillId: weakness, level: 5 }] }), [])
    expect(unlocked.lockedSkills).toEqual([])
    expect(requestKey(unlocked)).not.toBe(requestKey(request))
  })
})

describe('원하는 스킬 묶음·순서', () => {
  const weakness = skillIdByName(db, '약점 특효') // 방어구 스킬
  const evade = skillIdByName(db, '회피 성능') // 방어구 스킬
  const constitution = skillIdByName(db, '체술') // 방어구 스킬
  const attack = skillIdByName(db, '공격') // 무기 스킬
  const crit = skillIdByName(db, '간파') // 무기 스킬
  const hunger = skillIdByName(db, '쇄인룡의 굶주림') // 시리즈 스킬
  const lordsSoul = skillIdByName(db, '주인의 혼') // 그룹 스킬
  const points = (...ids: number[]) => ids.map((skillId) => ({ skillId, level: 1 }))
  const ids = (list: readonly SkillPoint[]) => list.map((p) => p.skillId)

  it('방어구 → 무기 → 시리즈 → 그룹 순서로 묶고 묶음 안에서는 넣은 순서를 지킨다 (요청도 같은 순서)', () => {
    const mixed = points(attack, lordsSoul, weakness, crit, hunger, evade, 999999)
    const grouped = [weakness, evade, attack, crit, hunger, lordsSoul]
    // 데이터에 없는 스킬은 맨 뒤
    expect(ids(sortRequired(db, mixed))).toEqual([...grouped, 999999])
    expect(ids(buildRequest(db, cond({ required: mixed }), []).required)).toEqual(grouped)
  })

  const earplugs = skillIdByName(db, '귀마개') // 방어구 스킬
  const line = (id: string, kind: SkillKind, index: number): RequiredDivider => ({ id, kind, index })
  /** 줄 모양: 스킬은 스킬 id, 구분선은 구분선 id */
  const shape = (items: readonly RequiredItem[]) =>
    items.map((item) => (item.type === 'skill' ? item.required.skillId : item.divider.id))

  it('구분선은 묶음 안 자리(위에 있는 스킬 수)에 놓고, 자리가 스킬 수를 넘으면 맨 아래, 스킬이 없는 묶음의 구분선은 뺀다', () => {
    const required = points(attack, weakness, evade, constitution)
    const dividers = [line('a', 'armor', 1), line('b', 'armor', 9), line('w', 'weapon', 0), line('s', 'set', 0)]
    expect(shape(requiredLayout(db, required, dividers, 'armor'))).toEqual([weakness, 'a', evade, constitution, 'b'])
    expect(shape(requiredLayout(db, required, dividers, 'weapon'))).toEqual(['w', attack])
    expect(requiredLayout(db, required, dividers, 'set')).toEqual([])
  })

  it('줄을 옮기거나 지우면 그 묶음의 스킬 순서와 구분선 자리를 다시 세고, 다른 묶음은 그대로 둔다', () => {
    // 저장값이 묶음 순서가 아니어도 묶음 순서로 정리한다
    const required = points(attack, weakness, crit, evade, constitution)
    const dividers = [line('w', 'weapon', 1), line('a', 'armor', 1)]
    const layout = requiredLayout(db, required, dividers, 'armor') // 약점 특효 / 회피 성능, 체술
    // 체술을 구분선 위로: 약점 특효, 체술 / 회피 성능
    const moved = applyRequiredLayout(db, required, dividers, 'armor', [layout[0], layout[3], layout[1], layout[2]])
    expect(ids(moved.required)).toEqual([weakness, constitution, evade, attack, crit])
    expect(moved.requiredDividers).toContainEqual(line('a', 'armor', 2))
    expect(shape(requiredLayout(db, moved.required, moved.requiredDividers, 'armor'))).toEqual([
      weakness,
      constitution,
      'a',
      evade,
    ])
    expect(shape(requiredLayout(db, moved.required, moved.requiredDividers, 'weapon'))).toEqual([attack, 'w', crit])
    // 구분선 위 스킬을 지우면 구분선이 한 칸 올라간다
    const removed = applyRequiredLayout(db, required, dividers, 'armor', layout.slice(1))
    expect(shape(requiredLayout(db, removed.required, removed.requiredDividers, 'armor'))).toEqual([
      'a',
      evade,
      constitution,
    ])
    // 꺼 둔 표시·고정은 그대로 따라간다
    const marked = [{ skillId: weakness, level: 5, off: true, locked: true }, ...points(evade)]
    const swapped = applyRequiredLayout(db, marked, [], 'armor', requiredLayout(db, marked, [], 'armor').reverse())
    expect(swapped.required).toEqual([
      { skillId: evade, level: 1 },
      { skillId: weakness, level: 5, off: true, locked: true },
    ])
  })

  it('새 스킬은 묶음 끝(맨 아래 구분선보다 아래)에 들어가고, 묶음에 스킬이 안 남으면 그 묶음 구분선도 지운다', () => {
    const required = points(weakness, attack)
    const dividers = [line('a', 'armor', 1), line('w', 'weapon', 0)]
    const layout = requiredLayout(db, required, dividers, 'armor') // 약점 특효 /
    const added = applyRequiredLayout(db, required, dividers, 'armor', [
      ...layout,
      { type: 'skill', required: { skillId: earplugs, level: 1 } },
    ])
    expect(shape(requiredLayout(db, added.required, added.requiredDividers, 'armor'))).toEqual([weakness, 'a', earplugs])
    const emptied = applyRequiredLayout(db, required, dividers, 'armor', layout.slice(1))
    expect(ids(emptied.required)).toEqual([attack])
    expect(emptied.requiredDividers).toEqual([line('w', 'weapon', 0)])
  })

  it('구분선 저장값은 모양을 검사하고, 검색 요청에는 들어가지 않는다', () => {
    const broken = [line('a', 'armor', 1), { id: 3 }, line('b', 'nope' as SkillKind, 0), line('c', 'armor', -1), null]
    const stored = normalizeConditions({
      required: points(weakness, evade),
      excluded: [],
      requiredDividers: [...broken, line('d', 'armor', 0.5)] as unknown as RequiredDivider[],
    })
    expect(stored.requiredDividers).toEqual([line('a', 'armor', 1)])
    // 예전 저장값엔 없음
    expect(normalizeConditions({ required: [], excluded: [] }).requiredDividers).toEqual([])
    expect(buildRequest(db, stored, [])).toEqual(buildRequest(db, cond({ required: points(weakness, evade) }), []))
  })

  it('원하는 스킬 순서만 다른 요청은 같은 키이고, 결과 요청을 지금 순서로 늘어놓는다', () => {
    const before = buildRequest(db, cond({ required: points(weakness, evade, attack) }), [])
    const after = buildRequest(db, cond({ required: points(evade, weakness, attack) }), [])
    expect(requestKey(after)).toBe(requestKey(before))
    expect(ids(withRequiredOrder(before, after.required).required)).toEqual([evade, weakness, attack])
    // 지금 조건에 없는 스킬은 원래 순서대로 맨 뒤
    expect(ids(withRequiredOrder(before, points(attack)).required)).toEqual([attack, weakness, evade])
    // 순서가 같으면 같은 요청 객체 (결과 카드가 다시 계산하지 않게)
    expect(withRequiredOrder(before, before.required)).toBe(before)
    // 레벨이 다르면 다른 키
    const higher = buildRequest(db, cond({ required: [...points(evade, weakness), { skillId: attack, level: 2 }] }), [])
    expect(requestKey(higher)).not.toBe(requestKey(before))
  })
})
