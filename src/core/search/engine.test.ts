import { describe, expect, it } from 'vitest'
import { GameDb } from '../../data/db'
import { ARMOR_KINDS, ELEMENTS, type ArmorKind, type Element, type GameData, type Skill, type SkillPoint } from '../../data/types'
import { armorByName, decorationIdByName, loadTestDb, skillIdByName } from '../../test/testDb'
import { activeSkillLevels, computeBuild, missingRequirements, unwantedSkillsOf } from '../calc'
import { resolveWeapon } from '../equipment'
import { customWeaponChoice, dbWeaponChoice, type GogmaSkills } from '../gogmaArtian'
import type { CustomTalisman, Slot, WeaponChoice } from '../types'
import { runSearch } from './engine'
import { prepare } from './prepare'
import { resultToBuild } from './toBuild'
import type {
  ResistanceMin,
  SearchProgress,
  SearchRequest,
  SearchResponse,
  SearchResultItem,
  SearchTalisman,
} from './types'

const db = loadTestDb()
const sid = (name: string) => skillIdByName(db, name)
const req = (...pairs: [string, number][]) => pairs.map(([name, level]) => ({ skillId: sid(name), level }))

function weaponOf(choice: WeaponChoice | null): SearchRequest['weapon'] {
  const resolved = resolveWeapon(db, choice)
  return { choice, skills: resolved?.skills ?? [], slots: resolved?.slots.map((s) => s.level) ?? [] }
}

const fixedTalismans: SearchTalisman[] = db.data.talismans
  .filter((t) => t.isMaxRank)
  .map((t) => ({ ref: { type: 'fixed', id: t.id }, skills: t.skills, slots: [] }))

function custom(id: string, skills: [string, number][], slots: Slot[]): { custom: CustomTalisman; search: SearchTalisman } {
  const points = req(...skills)
  return {
    custom: { id, name: id, rarity: 8, skills: points, slots },
    search: { ref: { type: 'custom', id }, skills: points, slots },
  }
}

function request(overrides: Partial<SearchRequest>): SearchRequest {
  return {
    required: [],
    excludedSkills: [],
    excludeMode: 'mark',
    weapon: weaponOf(null),
    talismans: fixedTalismans,
    includeLowRank: false,
    transcend: false,
    useDecorations: true,
    excludedArmorIds: [],
    sort: 'slots',
    limit: 30,
    maxShortfall: 0,
    lockedSkills: [],
    spareSlots: [],
    minResistances: [],
    ...overrides,
  }
}

const slotKey = (slots: readonly Slot[]) => slots.map((s) => `${s.kind[0]}${s.level}`).sort()
const slotScore = (slots: readonly Slot[]) => slots.reduce((sum, s) => sum + s.level * s.level, 0)

/** 원하는 스킬보다 모자란 레벨 합 (시리즈/그룹 스킬은 단계) */
const shortfallOf = (summary: ReturnType<typeof computeBuild>, required: readonly SkillPoint[]) =>
  missingRequirements(summary, required).reduce((sum, m) => sum + m.required - m.current, 0)

/** 결과 하나를 computeBuild 로 다시 계산해 엔진이 준 값과 맞는지 확인. shortfall = 응답의 모자란 레벨 합 */
function verifyItem(
  r: SearchRequest,
  item: SearchResultItem,
  customs: CustomTalisman[],
  variant: Parameters<typeof resultToBuild>[3] = {},
  shortfall = 0,
) {
  const summary = computeBuild(db, resultToBuild(db, item, r, variant), customs)
  if (shortfall === 0) expect(missingRequirements(summary, r.required)).toEqual([])
  else expect(shortfallOf(summary, r.required)).toBe(shortfall)
  expect(summary.slots.every((s) => s.valid)).toBe(true)
  expect(unwantedSkillsOf(summary, r.excludedSkills).sort()).toEqual([...item.unwantedSkills].sort())
  expect(fitsSpare(summary.freeSlots, r.spareSlots)).toBe(true)
  for (const { element, min } of r.minResistances) expect(summary.resistances[element]).toBeGreaterThanOrEqual(min)
  return summary
}

/** 결과의 스킬(시리즈/그룹 포함)·남는 슬롯: 같은 결과의 대체 후보를 골라도 이것은 바뀌면 안 된다 */
const outcomeOf = (summary: ReturnType<typeof computeBuild>) =>
  `${[...activeSkillLevels(summary)]
    .sort((a, b) => a[0] - b[0])
    .map(([id, level]) => `${id}:${level}`)
    .join(',')}|${slotKey(summary.freeSlots).join('')}`

/** 바꾸기 조합 set 일 때 그 부위 후보: 바꾸면 그 바꾸기 후보, 아니면 바꾸기 후보가 아닌 방어구 */
const candidatesIn = (item: SearchResultItem, kind: ArmorKind, set: Partial<Record<ArmorKind, number>>) =>
  item.armor[kind].filter((id) => (set[kind] === undefined ? !item.swaps[id] : item.swaps[id]?.key === set[kind]))

/** 결과가 나타내는 실제 방어구 조합 수: 바꾸기 조합(안 바꾸는 것 포함)마다 부위별 후보 수의 곱 */
const variantCountOf = (item: SearchResultItem) =>
  [{}, ...item.swapSets].reduce(
    (sum: number, set) => sum + ARMOR_KINDS.reduce((n, kind) => n * Math.max(1, candidatesIn(item, kind, set).length), 1),
    0,
  )

/** 결과를 실제 방어구·호석 조합으로 펼친 키 (α/β 는 함께 바꿀 수 있는 조합만) */
const physical = (items: readonly SearchResultItem[]) =>
  items.flatMap((item) => {
    const talismans = item.talismans.length > 0 ? item.talismans.map((t) => `${t.type}:${t.id}`) : ['-']
    return [{}, ...item.swapSets].flatMap((set) => {
      let combos = ['']
      for (const kind of ARMOR_KINDS) {
        const ids = item.armor[kind].length > 0 ? candidatesIn(item, kind, set) : [0]
        combos = combos.flatMap((c) => ids.map((id) => `${c}${id},`))
      }
      return combos.flatMap((c) => talismans.map((t) => c + t))
    })
  })

/** 남는 슬롯에 장식주 여유분이 다 들어가는지: 종류마다 크기 k 이상 여유분 수 ≤ 레벨 k 이상 남는 슬롯 수 (k = 1, 2, 3) */
const fitsSpare = (free: readonly Slot[], spare: readonly Slot[]) =>
  (['armor', 'weapon'] as const).every((kind) =>
    [1, 2, 3].every(
      (k) =>
        spare.filter((s) => s.kind === kind && s.level >= k).length <=
        free.filter((s) => s.kind === kind && s.level >= k).length,
    ),
  )

const armorSlot = (level: Slot['level']): Slot => ({ kind: 'armor', level })
const weaponSlot = (level: Slot['level']): Slot => ({ kind: 'weapon', level })

/** 응답의 모든 결과(+ 앞쪽 몇 개의 대체 방어구/호석)를 재검증 */
function verify(r: SearchRequest, res: SearchResponse, customs: CustomTalisman[] = []) {
  for (const item of res.items) {
    const summary = verifyItem(r, item, customs, {}, res.shortfall)
    expect(slotKey(summary.freeSlots)).toEqual(slotKey(item.freeSlots))
    expect(summary.defense.max).toBe(item.defense)
    const levels = activeSkillLevels(summary)
    for (const { skillId } of r.required) {
      expect(item.skillLevels.find((s) => s.skillId === skillId)?.level).toBe(levels.get(skillId))
    }
    expect(item.variantCount).toBe(variantCountOf(item))
    // 같은 결과로 묶인 대체 방어구·호석·α/β 조합은 고르면 방어력만 바뀌고 스킬·남는 슬롯은 그대로다
    const outcome = outcomeOf(summary)
    for (const [kind, ids] of Object.entries(item.armor)) {
      for (const id of ids.slice(1, 6)) {
        expect(outcomeOf(verifyItem(r, item, customs, { [kind]: id }, res.shortfall))).toBe(outcome)
      }
    }
    item.talismans.slice(1, 4).forEach((_, i) => {
      expect(outcomeOf(verifyItem(r, item, customs, { talismanIndex: i + 1 }, res.shortfall))).toBe(outcome)
    })
    for (const set of item.swapSets) expect(outcomeOf(verifyItem(r, item, customs, set, res.shortfall))).toBe(outcome)
  }
  expect(res.items.length).toBeLessThanOrEqual(r.limit)
  expect(res.total).toBeGreaterThanOrEqual(res.items.length)
  expect(new Set(res.items.map((i) => i.id)).size).toBe(res.items.length)
}

describe('runSearch', () => {
  it('요구 스킬이 없으면 빈 결과', () => {
    const res = runSearch(db, request({}))
    expect(res).toMatchObject({ items: [], total: 0, truncated: false })
  })

  it('방어구 스킬 검색 결과가 모두 computeBuild 재검증을 통과한다', () => {
    const r = request({ required: req(['약점 특효', 5], ['도전자', 3], ['회피 성능', 2]), limit: 40 })
    const res = runSearch(db, r)
    expect(res.items.length).toBe(40)
    verify(r, res)
  })

  it('시리즈 스킬 2단계: 같은 시리즈 4부위 이상', () => {
    const setSkill = sid('쇄인룡의 굶주림')
    const r = request({ required: [{ skillId: setSkill, level: 2 }, ...req(['약점 특효', 3])] })
    const res = runSearch(db, r)
    expect(res.items.length).toBeGreaterThan(0)
    verify(r, res)
    for (const item of res.items) {
      const summary = computeBuild(db, resultToBuild(db, item, r))
      expect(summary.bonuses.find((b) => b.skillId === setSkill)?.pieces).toBeGreaterThanOrEqual(4)
    }
  })

  it('그룹 스킬: 3부위 이상', () => {
    const r = request({ required: req(['주인의 혼', 1], ['약점 특효', 3]) })
    const res = runSearch(db, r)
    expect(res.items.length).toBeGreaterThan(0)
    verify(r, res)
  })

  it('고그 방어구는 부위마다 붙은 다른 몬스터의 시리즈 스킬도 1부위로 센다', () => {
    // 개룡의 수호 4부위 + 거극룡의 묵시록 2부위는 둘 다 붙은 고그그리브β 를 껴야 5부위에 들어간다
    const r = request({ required: req(['개룡의 수호', 2], ['거극룡의 묵시록', 1]) })
    const res = runSearch(db, r)
    expect(res.items.length).toBeGreaterThan(0)
    verify(r, res)
    const legs = armorByName(db, '고그그리브β').id
    for (const item of res.items) expect(resultToBuild(db, item, r).armor.legs?.id).toBe(legs)
  })

  describe('같은 결과 묶기 (α/β)', () => {
    const outcomeOfItem = (r: SearchRequest, item: SearchResultItem) => outcomeOf(computeBuild(db, resultToBuild(db, item, r)))
    /** 같은 계열(이름 끝 α·β·γ 를 뗀 이름)의 방어구 한 부위만 다르고 스킬·남는 슬롯이 같은 결과 쌍이 없다 */
    const expectNoFamilyTwins = (r: SearchRequest, res: SearchResponse) => {
      const family = (id: number | undefined) => db.armor.get(id ?? -1)?.name.ko.replace(/[αβγ]$/, '')
      const outcomes = res.items.map((item) => outcomeOfItem(r, item))
      for (let i = 0; i < res.items.length; i++) {
        for (let j = i + 1; j < res.items.length; j++) {
          const [a, b] = [res.items[i], res.items[j]]
          if (outcomes[i] !== outcomes[j] || JSON.stringify(a.talismans[0]) !== JSON.stringify(b.talismans[0])) continue
          const parts = ARMOR_KINDS.filter((k) => a.armor[k][0] !== b.armor[k][0])
          if (parts.length === 1) expect(family(a.armor[parts[0]][0]), `#${i + 1} #${j + 1}`).not.toBe(family(b.armor[parts[0]][0]))
        }
      }
    }

    it('고르면 스킬이 바뀌는 방어구는 대체 후보로 묶지 않고 따로 결과로 낸다', () => {
      // 회복 속도를 원하지 않으면 무구한 용관α(회복 속도 2, 슬롯 3-2)와 β(회복 속도 1, 3-2-1)는 스킬·남는 슬롯이 다른 결과다
      const r = request({ required: req(['백열룡의 맥동', 2], ['도전자', 5], ['속성 흡수', 2]), limit: 300 })
      const res = runSearch(db, r)
      verify(r, res)
      const alpha = armorByName(db, '무구한 용관α').id
      const beta = armorByName(db, '무구한 용관β').id
      expect(res.items.some((item) => item.armor.head[0] === alpha)).toBe(true)
      expect(res.items.some((item) => item.armor.head.includes(alpha) && item.armor.head.includes(beta))).toBe(false)
    })

    it('α/β 가 장식주를 끼냐 안 끼냐만 다르면 한 결과로 묶고, α 로 바꾸면 그 장식주를 뺀다', () => {
      // 회복 속도를 원하면 무구한 용관β(3-2-1) + 조복주【1】 = 무구한 용관α(3-2): 스킬·남는 슬롯이 같다
      const r = request({ required: req(['회복 속도', 3], ['도전자', 5], ['백열룡의 맥동', 2]), limit: 300 })
      const res = runSearch(db, r)
      verify(r, res)
      const alpha = armorByName(db, '무구한 용관α').id
      const beta = armorByName(db, '무구한 용관β').id
      const jewel = decorationIdByName(db, '조복주【1】')
      const grouped = res.items.filter((item) => item.armor.head[0] === beta && item.armor.head.includes(alpha))
      expect(grouped.length).toBeGreaterThan(0)
      for (const item of grouped) {
        expect(item.swaps[alpha]).toEqual({ key: alpha, jewels: [jewel] })
        // 빼는 장식주는 β 의 그 부위 슬롯에 넣어 둔다 (바꿔도 다른 부위 장식주는 그대로)
        expect(item.decorations.head).toContain(jewel)
        const swapped = resultToBuild(db, item, r, { head: alpha })
        expect(swapped.decorations.head).not.toContain(jewel)
        for (const kind of ARMOR_KINDS.filter((k) => k !== 'head')) expect(swapped.decorations[kind]).toEqual(item.decorations[kind])
      }
      expectNoFamilyTwins(r, res)
    })

    it('시리즈/그룹 스킬만 다른 방어구도 그 스킬 발동이 같으면 한 결과로 묶는다', () => {
      // 고그그리브α·β 는 스킬·슬롯이 같고 거극룡의 묵시록과 함께 붙은 다른 몬스터의 시리즈 스킬만 다르다
      const r = request({ required: req(['약점 특효', 5], ['힘의 해방', 5], ['도전자', 5], ['회피 성능', 5]), limit: 300 })
      const res = runSearch(db, r)
      verify(r, res)
      const ids = ['고그그리브α', '고그그리브β'].map((name) => armorByName(db, name).id)
      const grouped = res.items.filter((item) => ids.every((id) => item.armor.legs.includes(id)))
      expect(grouped.length).toBeGreaterThan(0)
      for (const item of grouped) expect(item.swaps[item.armor.legs[1]]?.jewels).toEqual([])
      expectNoFamilyTwins(r, res)
    })

    it('여러 조건에서 같은 계열 α/β 한 부위만 다르고 스킬·남는 슬롯이 같은 결과가 따로 나오지 않는다', () => {
      for (const required of [
        req(['약점 특효', 5], ['도전자', 5], ['연격', 3], ['회피 성능', 3], ['체술', 2], ['귀마개', 2]),
        req(['힘의 해방', 5], ['약점 특효', 5], ['회피 거리 UP', 3]),
        req(['쇄인룡의 굶주림', 2], ['약점 특효', 5], ['도전자', 5]),
      ]) {
        const r = request({ required, limit: 150 })
        const res = runSearch(db, r)
        verify(r, res)
        expectNoFamilyTwins(r, res)
      }
    })

    it('개수는 결과를 모두 펼친 수와 같다 (α/β 가 시리즈/그룹 발동 때문에 따로 보이는 결과만 빠진다)', () => {
      // 장식주가 스킬마다 하나뿐이라 잎마다 넣을 수 있는지만 DP 로 센 개수 (§6.5) vs 결과를 하나하나 넣은 수
      const countAll = (required: SkillPoint[]) => {
        const r = request({ required, limit: 20 })
        const all = runSearch(db, { ...r, limit: 100_000 })
        expect(all.items.length).toBeGreaterThan(1000)
        expect(all.items.length).toBeLessThan(100_000)
        return { counted: runSearch(db, r).total, all: all.items.length }
      }
      const exact = countAll(req(['쇄인룡의 굶주림', 2], ['약점 특효', 5], ['도전자', 5]))
      expect(exact.counted).toBe(exact.all)
      // 고그 α/β 처럼 바꾸면 시리즈 발동이 달라지는 조합은 결과마다 봐서 따로 보이지만 개수에는 없다
      const split = countAll(req(['약점 특효', 5], ['도전자', 5], ['연격', 5]))
      expect(split.counted).toBeLessThan(split.all)
      expect(split.counted).toBeGreaterThan(split.all * 0.97)
    })
  })

  describe('비선호 스킬', () => {
    const required = req(['약점 특효', 5], ['도전자', 5], ['연격', 3])
    const excludedSkills = [sid('공세')]

    it('exclude 모드: 방어구·호석·장식주 어디에도 비선호 스킬이 없다', () => {
      const r = request({ required, excludedSkills, excludeMode: 'exclude' })
      const res = runSearch(db, r)
      expect(res.items.length).toBeGreaterThan(0)
      expect(res.items.every((i) => i.unwantedSkills.length === 0)).toBe(true)
      verify(r, res)
      for (const item of res.items) {
        for (const ids of Object.values(item.armor)) {
          for (const id of ids) expect(db.armor.get(id)!.skills.some((s) => excludedSkills.includes(s.skillId))).toBe(false)
        }
      }
    })

    it('mark 모드: 비선호 스킬이 든 결과도 같은 정렬에 섞고, 정렬 기준이 같으면 없는 쪽이 앞', () => {
      const r = request({ required, excludedSkills, excludeMode: 'mark' })
      const res = runSearch(db, r)
      const excluded = runSearch(db, { ...r, excludeMode: 'exclude' })
      verify(r, res)
      // exclude 모드가 후보에서 뺀 방어구·호석으로 만든 조합까지 센다
      expect(res.total).toBeGreaterThan(excluded.total)
      const unwanted = res.items.filter((i) => i.unwantedSkills.length > 0)
      expect(unwanted.length).toBeGreaterThan(0)
      expect(unwanted.every((i) => i.unwantedSkills.includes(excludedSkills[0]))).toBe(true)
      const key = (i: SearchResultItem) => [slotScore(i.freeSlots), i.defense, i.unwantedSkills.length > 0 ? 0 : 1]
      const keys = res.items.map(key)
      expect(keys).toEqual([...keys].sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]))
      // 비선호 스킬이 없는 결과 중 1등은 exclude 모드의 1등과 같은 값이다
      const clean = res.items.find((i) => i.unwantedSkills.length === 0)!
      expect(key(clean)).toEqual(key(excluded.items[0]))
    })

    it('무기 자체 스킬은 비선호로 세지 않는다', () => {
      const choice: WeaponChoice = { type: 'db', id: 6 } // 허무의 활Ⅰ: 집중 Lv2, 슬롯 [1]
      expect(db.weapons.get(6)!.skills.map((s) => s.skillId)).toContain(sid('집중'))
      const r = request({ required, weapon: weaponOf(choice), excludedSkills: [sid('집중')] })
      const res = runSearch(db, r)
      const plain = runSearch(db, { ...r, excludedSkills: [] })
      expect(res.items.every((i) => i.unwantedSkills.length === 0)).toBe(true)
      expect(res.total).toBe(plain.total)
      verify(r, res)
    })
  })

  describe('무기 스킬', () => {
    it('무기 슬롯 장식주로 무기 스킬을 채운다', () => {
      const r = request({ required: req(['공격', 5], ['약점 특효', 2]), weapon: weaponOf({ type: 'db', id: 71 }) }) // 앙길바인 [3,3,3]
      const res = runSearch(db, r)
      expect(res.items.length).toBeGreaterThan(0)
      verify(r, res)
      expect(runSearch(db, { ...r, weapon: weaponOf(null) }).total).toBe(0)
    })

    it('사용자 호석의 무기 슬롯까지 사용한다', () => {
      const t = custom('weapon-slot', [], [
        { kind: 'weapon', level: 1 },
        { kind: 'armor', level: 1 },
      ])
      const r = request({
        required: req(['공격', 2]),
        weapon: weaponOf({ type: 'db', id: 6 }), // 무기 슬롯 [1] 하나
        talismans: [...fixedTalismans, t.search],
      })
      const res = runSearch(db, r)
      expect(res.items.length).toBeGreaterThan(0)
      verify(r, res, [t.custom])
      for (const item of res.items) {
        expect(item.talismans[0]).toEqual({ type: 'custom', id: 'weapon-slot' })
        expect(item.decorations.talisman[0]).not.toBeNull()
      }
      expect(runSearch(db, { ...r, talismans: fixedTalismans }).total).toBe(0)
    })
  })

  describe('거극 아티어 무기', () => {
    const hunger = sid('쇄인룡의 굶주림')
    const lordsSoul = sid('주인의 혼')
    const gogma = (skills?: GogmaSkills) => weaponOf(dbWeaponChoice(db.weaponByGameKey('great-sword', 87)!.id, skills))
    /** 결과의 방어구 중 그 시리즈/그룹 스킬에 속한 부위 수 */
    const armorPieces = (r: SearchRequest, item: SearchResultItem, skillId: number) => {
      const { equipment } = computeBuild(db, resultToBuild(db, item, r))
      return ARMOR_KINDS.filter((k) => equipment[k]?.bonusSkillIds.includes(skillId)).length
    }

    it('무기에 붙은 시리즈 스킬만큼 방어구를 1부위 덜 찾는다', () => {
      const required = [{ skillId: hunger, level: 2 }, ...req(['약점 특효', 3])]
      const r = request({ required, weapon: gogma({ setSkillId: hunger, groupSkillId: null }), limit: 100 })
      const res = runSearch(db, r)
      verify(r, res)
      const pieces = res.items.map((item) => armorPieces(r, item, hunger))
      expect(Math.min(...pieces)).toBe(3)

      const without = request({ required, weapon: gogma(), limit: 100 })
      const plain = runSearch(db, without)
      verify(without, plain)
      expect(Math.min(...plain.items.map((item) => armorPieces(without, item, hunger)))).toBe(4)
      expect(res.total).toBeGreaterThan(plain.total)
    })

    it('직접 입력 무기의 거극 아티어 스킬도 똑같이 센다', () => {
      const required = [{ skillId: hunger, level: 2 }, ...req(['약점 특효', 3])]
      const skills = { setSkillId: hunger, groupSkillId: null }
      // 거극 아티어 무기는 슬롯 [3,3,3]·무기 스킬 없음·방어력 보너스 없음이라 같은 직접 입력 무기와 결과가 같다
      const fromDb = runSearch(db, request({ required, weapon: gogma(skills) }))
      const r = request({ required, weapon: weaponOf(customWeaponChoice([3, 3, 3], [], skills)) })
      const res = runSearch(db, r)
      verify(r, res)
      expect(res.total).toBe(fromDb.total)
    })

    it('그룹 스킬도 1부위로 센다', () => {
      const required = req(['주인의 혼', 1], ['약점 특효', 3])
      // 남는 슬롯이 많은 앞쪽 결과는 3부위짜리라, 2부위 조합까지 보이게 넉넉히 받는다
      const r = request({ required, weapon: gogma({ setSkillId: null, groupSkillId: lordsSoul }), limit: 2000 })
      const res = runSearch(db, r)
      verify(r, res)
      expect(Math.min(...res.items.map((item) => armorPieces(r, item, lordsSoul)))).toBe(2)
      expect(res.total).toBeGreaterThan(runSearch(db, request({ required, weapon: gogma() })).total)
    })
  })

  it('방어구 초월: 초월 슬롯으로만 가능한 조합을 찾는다', () => {
    const highRarity = db.data.armor.filter((a) => a.rarity >= 7).map((a) => a.id)
    const r = request({ required: req(['약점 특효', 5], ['도전자', 5]), excludedArmorIds: highRarity, talismans: [] })
    expect(runSearch(db, r).total).toBe(0)
    const transcended = { ...r, transcend: true }
    const res = runSearch(db, transcended)
    expect(res.items.length).toBeGreaterThan(0)
    verify(transcended, res)
  })

  it('도움이 되는 사용자 호석을 사용한다', () => {
    const t = custom('we-burst', [['약점 특효', 2], ['연격', 1]], [{ kind: 'armor', level: 3 }])
    const r = request({ required: req(['약점 특효', 5], ['도전자', 5], ['연격', 5]), talismans: [] })
    expect(runSearch(db, r).total).toBe(0)
    const withCustom = { ...r, talismans: [...fixedTalismans, t.search] }
    const res = runSearch(db, withCustom)
    expect(res.items.length).toBeGreaterThan(0)
    expect(res.items[0].talismans[0]).toEqual({ type: 'custom', id: 'we-burst' })
    verify(withCustom, res, [t.custom])
  })

  it('불가능한 요청은 빠르게 빈 결과를 돌려준다', () => {
    const impossible = request({
      required: req(['약점 특효', 5], ['도전자', 5], ['연격', 5], ['힘의 해방', 5], ['앙심', 5], ['완전 충전', 5], ['공세', 5]),
    })
    const res = runSearch(db, impossible)
    expect(res.total).toBe(0)
    expect(res.truncated).toBe(false)
    expect(res.elapsedMs).toBeLessThan(3000)
    // 특정 무기에만 붙는 스킬: 무기 없이 검색하면 얻을 방법이 없다
    expect(runSearch(db, request({ required: req(['암흑', 1], ['약점 특효', 1]) })).total).toBe(0)
  })

  it('limit 과 정렬 기준을 지킨다', () => {
    const base = request({ required: req(['약점 특효', 3], ['회피 성능', 2]), limit: 10 })
    const bySlots = runSearch(db, base)
    expect(bySlots.items).toHaveLength(10)
    const scores = bySlots.items.map((i) => slotScore(i.freeSlots))
    expect(scores).toEqual([...scores].sort((a, b) => b - a))

    const byDefense = runSearch(db, { ...base, sort: 'defense' })
    const defenses = byDefense.items.map((i) => i.defense)
    expect(defenses).toEqual([...defenses].sort((a, b) => b - a))
    expect(defenses[0]).toBeGreaterThanOrEqual(Math.max(...bySlots.items.map((i) => i.defense)))
    verify(base, bySlots)
    verify({ ...base, sort: 'defense' }, byDefense)
  })

  it('탐색 상한·중단 요청에 걸리면 truncated', () => {
    const r = request({ required: req(['약점 특효', 1]) })
    const limited = runSearch(db, r, { limits: { maxLeaves: 2 } })
    expect(limited.truncated).toBe(true)
    // 잎(탐색 클래스 조합) 하나에 결과가 여럿이라 개수는 상한보다 클 수 있다 (멈추기 전까지 센 수)
    expect(limited.total).toBeLessThan(runSearch(db, r).total)
    verify(r, limited)

    let calls = 0
    const stopped = runSearch(db, r, { shouldStop: () => ++calls > 2 })
    expect(stopped.truncated).toBe(true)
  })

  it('진행률을 보고한다', () => {
    const ratios: number[] = []
    runSearch(db, request({ required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3]) }), {
      onProgress: (p) => ratios.push(p.ratio),
    })
    expect(ratios.length).toBeGreaterThan(0)
    expect(ratios.every((r) => r >= 0 && r <= 1)).toBe(true)
    expect(ratios.at(-1)).toBe(1)
  })

  describe('장식주 없이', () => {
    const noDeco = (overrides: Partial<SearchRequest>) => request({ useDecorations: false, ...overrides })
    const pointsOf = (skills: readonly SkillPoint[], skillId: number) =>
      skills.reduce((sum, s) => (s.skillId === skillId ? sum + s.level : sum), 0)

    /** 방어구(상위 랭크)만으로 요구 점수를 채우는 실제 방어구 조합 수 — 엔진과 독립적으로 부위별 DP 로 센다 */
    function countArmorOnlyCombos(required: readonly SkillPoint[]): number {
      const keyOf = (pts: readonly number[]) => pts.join(',')
      let states = new Map([[keyOf(required.map(() => 0)), 1]])
      for (const kind of ARMOR_KINDS) {
        const next = new Map<string, number>()
        const pieces = db.armorByKind[kind].filter((p) => p.rank !== 'low')
        for (const [key, count] of states) {
          const pts = key.split(',').map(Number)
          for (const piece of pieces) {
            const k = keyOf(required.map((r, i) => Math.min(r.level, pts[i] + pointsOf(piece.skills, r.skillId))))
            next.set(k, (next.get(k) ?? 0) + count)
          }
        }
        states = next
      }
      return states.get(keyOf(required.map((r) => r.level))) ?? 0
    }

    it('방어구만으로 조건을 채우는 조합을 빠짐없이 찾는다', () => {
      const r = noDeco({ required: req(['약점 특효', 5], ['도전자', 5]), talismans: [], limit: 10_000 })
      const res = runSearch(db, r)
      expect(res.truncated).toBe(false)
      expect(res.items).toHaveLength(res.total)
      expect(res.items.reduce((n, item) => n + item.variantCount, 0)).toBe(countArmorOnlyCombos(r.required))
    })

    it('장식주를 하나도 쓰지 않고 슬롯은 모두 남긴다', () => {
      const r = noDeco({ required: req(['약점 특효', 5], ['도전자', 5]), weapon: weaponOf({ type: 'db', id: 71 }) }) // 앙길바인 [3,3,3]
      const res = runSearch(db, r)
      expect(res.items).toHaveLength(r.limit)
      verify(r, res)
      for (const item of res.items) {
        expect(Object.values(item.decorations).flat().every((id) => id === null)).toBe(true)
        const summary = computeBuild(db, resultToBuild(db, item, r))
        expect(summary.freeSlots).toHaveLength(summary.slots.length)
      }
      const scores = res.items.map((i) => slotScore(i.freeSlots))
      expect(scores).toEqual([...scores].sort((a, b) => b - a))
    })

    it('장식주가 있어야 채워지는 조건은 결과가 없다', () => {
      const r = noDeco({ required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3]), talismans: [] })
      expect(runSearch(db, r).total).toBe(0)
      expect(runSearch(db, { ...r, useDecorations: true }).total).toBeGreaterThan(0)
    })

    it('무기 스킬은 무기 자체 스킬로만 센다', () => {
      const weapon = weaponOf({ type: 'db', id: 6 }) // 허무의 활Ⅰ: 집중 Lv2, 슬롯 [1]
      const r = noDeco({ required: req(['집중', 2], ['약점 특효', 5], ['도전자', 5]), weapon })
      const res = runSearch(db, r)
      expect(res.items.length).toBeGreaterThan(0)
      verify(r, res)
      expect(runSearch(db, { ...r, required: req(['집중', 3], ['약점 특효', 5], ['도전자', 5]) }).total).toBe(0)
    })
  })

  describe('장식주 여유분', () => {
    /** 여유분 없이 찾은 결과(limit 안에 모두 든다) 중 남는 슬롯에 여유분이 들어가는 것 */
    const fittingPlain = (r: SearchRequest) => {
      const plain = runSearch(db, { ...r, spareSlots: [] })
      expect(plain.truncated).toBe(false)
      expect(plain.items).toHaveLength(plain.total)
      return plain.items.filter((item) => fitsSpare(item.freeSlots, r.spareSlots))
    }

    it('방어구 여유분: 여유분 없이 찾은 결과 중 남는 슬롯에 여유분이 들어가는 조합을 빠짐없이 찾는다', () => {
      // 방어구 장식주는 넣을 것이 부족분으로 정해져서, 같은 조합의 남는 슬롯은 여유분이 있어도 없어도 같다
      const required = req(['쇄인룡의 굶주림', 2], ['약점 특효', 5], ['도전자', 5])
      for (const spareSlots of [[armorSlot(3), armorSlot(1)], [armorSlot(3), armorSlot(3)], [armorSlot(2), armorSlot(2), armorSlot(1)]]) {
        const r = request({ required, spareSlots, limit: 100_000 })
        const res = runSearch(db, r)
        expect(res.truncated).toBe(false)
        expect(res.items.length).toBeGreaterThan(50)
        const expected = fittingPlain(r)
        expect(physical(res.items).sort()).toEqual(physical(expected).sort())
        // 잎마다 DP 로 센 개수도 여유분을 넣어 센다 (§6.5)
        expect(runSearch(db, { ...r, limit: 20 }).total).toBe(res.items.length)
        verify(r, { ...res, items: res.items.slice(0, 30) })
      }
    })

    it('장식주 없이 + 여유분: 방어구·호석 슬롯에 여유분이 들어가는 조합만', () => {
      const r = request({
        required: req(['약점 특효', 5], ['도전자', 5]),
        useDecorations: false,
        talismans: [],
        spareSlots: [armorSlot(3), armorSlot(2)],
        limit: 100_000,
      })
      const res = runSearch(db, r)
      expect(res.truncated).toBe(false)
      expect(res.items.length).toBeGreaterThan(50)
      expect(physical(res.items).sort()).toEqual(physical(fittingPlain(r)).sort())
      // 고그 α/β 처럼 시리즈 발동이 달라 따로 보이는 결과만 개수에서 빠진다 (여유분이 없어도 같다, §6.5)
      const counted = runSearch(db, { ...r, limit: 20 }).total
      expect(counted).toBeLessThanOrEqual(res.items.length)
      expect(counted).toBeGreaterThan(res.items.length * 0.97)
      verify(r, { ...res, items: res.items.slice(0, 30) })
    })

    it('무기 여유분: 무기 장식주를 넣고도 무기 슬롯이 남는 조합만, 안 되면 결과가 없다', () => {
      const weapon = weaponOf({ type: 'db', id: 71 }) // 앙길바인 [3,3,3]
      const required = req(['공격', 3], ['약점 특효', 3])
      const plain = runSearch(db, request({ required, weapon }))
      const r = request({ required, weapon, spareSlots: [weaponSlot(3), weaponSlot(3)] })
      const res = runSearch(db, r)
      expect(res.items.length).toBeGreaterThan(0)
      expect(res.total).toBeLessThanOrEqual(plain.total)
      verify(r, res)
      // 공격을 채우려면 무기 슬롯을 하나는 써야 한다
      expect(runSearch(db, { ...r, spareSlots: [3, 3, 3].map(() => weaponSlot(3)) }).total).toBe(0)
    })

    it('여유분이 남은 슬롯보다 많으면 빠르게 빈 결과', () => {
      const r = request({ required: req(['약점 특효', 1]), spareSlots: Array.from({ length: 20 }, () => armorSlot(3)), maxShortfall: 99 })
      const res = runSearch(db, r)
      expect(res).toMatchObject({ items: [], total: 0, truncated: false, shortfall: 0 })
      expect(res.elapsedMs).toBeLessThan(1000)
    })

    it('여유분이 크면 슬롯이 많은 방어구로 좁혀져 정렬 기준대로 찾는다', () => {
      const r = request({ required: req(['약점 특효', 3], ['도전자', 3]), spareSlots: [armorSlot(3), armorSlot(3), armorSlot(3)], limit: 50 })
      const res = runSearch(db, r)
      expect(res.items).toHaveLength(50)
      verify(r, res)
      const scores = res.items.map((i) => slotScore(i.freeSlots))
      expect(scores).toEqual([...scores].sort((a, b) => b - a))
    })
  })

  describe('내성 조건', () => {
    /** 실제 조합 키(physical)의 방어구 내성 합 */
    const resistanceOfKey = (key: string, element: Element) =>
      key
        .split(',')
        .slice(0, ARMOR_KINDS.length)
        .reduce((sum, id) => sum + (db.armor.get(Number(id))?.resistances[element] ?? 0), 0)

    it('내성 조건 없이 찾은 조합 중 방어구 내성 합이 조건을 채우는 조합을 빠짐없이 찾는다', () => {
      const required = req(['쇄인룡의 굶주림', 2], ['약점 특효', 5], ['도전자', 5])
      const plain = runSearch(db, request({ required, limit: 100_000 }))
      expect(plain.truncated).toBe(false)
      expect(plain.items).toHaveLength(plain.total)
      const all = physical(plain.items)
      // 이 조합들의 내성 합은 화 3~13, 수 −4~5, 뇌 −8~0, 빙 −4~4, 용 −17~−7
      const lows: Record<Element, number> = { fire: 5, water: -2, thunder: -7, ice: -3, dragon: -16 }
      const cases: ResistanceMin[][] = [
        [{ element: 'fire', min: 8 }],
        [
          { element: 'water', min: 0 },
          { element: 'thunder', min: -4 },
        ],
        ELEMENTS.map((element) => ({ element, min: lows[element] })),
      ]
      for (const minResistances of cases) {
        const r = request({ required, minResistances, limit: 100_000 })
        const res = runSearch(db, r)
        expect(res.truncated).toBe(false)
        const expected = all.filter((key) => minResistances.every(({ element, min }) => resistanceOfKey(key, element) >= min))
        expect(expected.length).toBeGreaterThan(50)
        expect(expected.length).toBeLessThan(all.length)
        expect(physical(res.items).sort()).toEqual(expected.sort())
        // 잎마다 센 개수도 펼친 결과 수와 같다 (마지막 부위는 클래스를 나누지 않고 옵션 묶음을 거른다)
        expect(runSearch(db, { ...r, limit: 20 }).total).toBe(res.items.length)
        verify(r, { ...res, items: res.items.slice(0, 30) })
        // 대체 후보를 골라도 조건을 건 내성은 그대로다
        const resistancesOf = (item: SearchResultItem, variant: Parameters<typeof resultToBuild>[3]) => {
          const summary = computeBuild(db, resultToBuild(db, item, r, variant))
          return minResistances.map(({ element }) => summary.resistances[element])
        }
        for (const item of res.items.slice(0, 30)) {
          const shown = resistancesOf(item, {})
          for (const kind of ARMOR_KINDS) {
            for (const id of item.armor[kind].slice(1)) expect(resistancesOf(item, { [kind]: id })).toEqual(shown)
          }
          for (const set of item.swapSets) expect(resistancesOf(item, set)).toEqual(shown)
        }
      }
    })

    it('조건을 건 내성이 다른 방어구는 같은 옵션(대체 후보)으로 묶지 않는다', () => {
      // 하위 랭크 가쟈우부츠·필라길그리브는 스킬·시리즈/그룹 스킬·슬롯이 같고 내성만 다르다 (화 0 / −3)
      const ids = ['가쟈우부츠', '필라길그리브'].map((name) => armorByName(db, name).id).sort((a, b) => a - b)
      const optionsOf = (r: SearchRequest) =>
        prepare(db, r)!
          .classes.flat()
          .flatMap((cls) => cls.options)
          .map((option) => option.members.map((m) => m.id).filter((id) => ids.includes(id)))
          .filter((members) => members.length > 0)
          .sort((a, b) => a[0] - b[0])
      const r = request({ required: req(['물 내성', 1]), includeLowRank: true })
      expect(optionsOf(r)).toEqual([ids])
      expect(optionsOf({ ...r, minResistances: [{ element: 'fire', min: 0 }] })).toEqual(ids.map((id) => [id]))
    })

    it('후보로 늘 채워지는 조건은 없는 것과 같고, 채울 수 없는 조건은 바로 빈 결과', () => {
      const r = request({ required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3]), limit: 50 })
      const plain = runSearch(db, r)
      const loose = runSearch(db, { ...r, minResistances: [{ element: 'fire', min: -30 }] })
      expect(loose.items).toEqual(plain.items)
      expect(loose.total).toBe(plain.total)
      const impossible = runSearch(db, { ...r, minResistances: [{ element: 'fire', min: 30 }], maxShortfall: 99 })
      expect(impossible).toMatchObject({ items: [], total: 0, truncated: false, shortfall: 0 })
    })

    it('장식주 없이 + 내성 조건 + 정렬', () => {
      const r = request({
        required: req(['약점 특효', 5], ['도전자', 5]),
        useDecorations: false,
        minResistances: [
          { element: 'ice', min: 0 },
          { element: 'dragon', min: 0 },
        ],
        sort: 'defense',
        limit: 50,
      })
      const res = runSearch(db, r)
      expect(res.items).toHaveLength(50)
      verify(r, res)
      const defenses = res.items.map((i) => i.defense)
      expect(defenses).toEqual([...defenses].sort((a, b) => b - a))
    })
  })

  describe('내성순 정렬', () => {
    const hunger = req(['쇄인룡의 굶주림', 2], ['약점 특효', 5], ['도전자', 5])
    /** 결과의 순위 키: 정렬 속성 내성(대표 조합) → 남는 슬롯 점수 → 방어력 → 비선호 스킬이 없으면 1 */
    const rankOf = (r: SearchRequest, item: SearchResultItem) => [
      computeBuild(db, resultToBuild(db, item, r)).resistances[r.sort as Element],
      slotScore(item.freeSlots),
      item.defense,
      item.unwantedSkills.length > 0 ? 0 : 1,
    ]
    const byRank = (a: number[], b: number[]) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2] || b[3] - a[3]

    /**
     * 결과를 모두 찾으면 순위 키 순이고 펼친 조합이 남는 슬롯순과 같은지, 상위 limit 개만 찾아도 그 앞쪽과 같은지,
     * 대체 후보·α/β 를 골라도 정렬 속성 내성이 그대로인지. all = 모두 찾은 응답, top = 상위 20개만 찾은 응답
     */
    function checkSorted(r: SearchRequest): { all: SearchResponse; top: SearchResponse } {
      const all = runSearch(db, { ...r, limit: 100_000 })
      expect(all.truncated).toBe(false)
      expect(all.items).toHaveLength(all.total)
      const bySlots = runSearch(db, { ...r, sort: 'slots', limit: 100_000 })
      expect(all.shortfall).toBe(bySlots.shortfall)
      expect(physical(all.items).sort()).toEqual(physical(bySlots.items).sort())
      const ranks = all.items.map((item) => rankOf(r, item))
      expect(ranks).toEqual([...ranks].sort(byRank))
      expect(new Set(ranks.map((rank) => rank[0])).size).toBeGreaterThan(2)
      // 잎마다 장식주가 다 들어가는 조합의 가장 높은 내성으로 자르고 펼친 상위 결과가 모두 찾아 정렬한 앞쪽과 같다
      const limited = { ...r, limit: 20 }
      const top = runSearch(db, limited)
      expect(top.items.map((item) => rankOf(r, item))).toEqual(ranks.slice(0, 20))
      // 잎마다 센 개수에는 시리즈/그룹 발동이 달라 따로 보이는 α 결과가 빠진다 (§6.5, 남는 슬롯순도 같다)
      expect(top.total).toBeLessThanOrEqual(all.total)
      verify(limited, top)
      const element = r.sort as Element
      const resistanceOf = (item: SearchResultItem, variant: Parameters<typeof resultToBuild>[3]) =>
        computeBuild(db, resultToBuild(db, item, r, variant)).resistances[element]
      const changed = all.items.filter((item) => {
        const shown = resistanceOf(item, {})
        const variants = [
          ...ARMOR_KINDS.flatMap((kind) => item.armor[kind].slice(1).map((id) => ({ [kind]: id }))),
          ...item.swapSets,
        ]
        return variants.some((variant) => resistanceOf(item, variant) !== shown)
      })
      expect(changed.map((item) => item.id)).toEqual([])
      return { all, top }
    }

    it('정렬 속성 내성 → 남는 슬롯 → 방어력 순으로 상위 limit 개를 찾는다', () => {
      for (const sort of ['fire', 'dragon'] as const) {
        const { all, top } = checkSorted(request({ required: hunger, sort }))
        // 따로 보이는 α 결과가 없는 조건이라 잎마다 센 개수가 정확하다
        expect(top.total).toBe(all.total)
      }
    })

    it('정렬 속성 내성이 다른 방어구는 같은 옵션(대체 후보)으로 묶지 않는다', () => {
      // 하위 랭크 가쟈우부츠·필라길그리브는 스킬·시리즈/그룹 스킬·슬롯이 같고 내성이 다르다 (수 5 / 4)
      const ids = ['가쟈우부츠', '필라길그리브'].map((name) => armorByName(db, name).id).sort((a, b) => a - b)
      const optionsOf = (r: SearchRequest) =>
        prepare(db, r)!
          .classes.flat()
          .flatMap((cls) => cls.options)
          .map((option) => option.members.map((m) => m.id).filter((id) => ids.includes(id)))
          .filter((members) => members.length > 0)
          .sort((a, b) => a[0] - b[0])
      const r = request({ required: req(['물 내성', 1]), includeLowRank: true })
      expect(optionsOf(r)).toEqual([ids])
      expect(optionsOf({ ...r, sort: 'water' })).toEqual(ids.map((id) => [id]))
      // 이렇게 나뉜 방어구가 든 결과: 장식주 없이 하위 랭크 포함
      const required = req(['약점 특효', 5], ['도전자', 5], ['연격', 3])
      const { all } = checkSorted(request({ required, useDecorations: false, includeLowRank: true, sort: 'ice' }))
      expect(all.total).toBeGreaterThan(runSearch(db, request({ required, useDecorations: false, includeLowRank: true })).total)
    })

    it('비선호 스킬(표시만)도 같은 기준으로 섞고, 기준이 모두 같으면 비선호 스킬이 없는 쪽이 앞', () => {
      const { all } = checkSorted(request({ required: hunger, excludedSkills: [sid('체술')], sort: 'water' }))
      expect(all.items.some((item) => item.unwantedSkills.length > 0)).toBe(true)
    })

    it('내성 조건과 함께: 조건을 건 속성으로도, 다른 속성으로도 정렬한다', () => {
      // 다른 속성으로 정렬하면 그 내성이 조건 뒤에 붙는다 (마지막 부위 옵션 묶음은 조건을 건 내성으로만 거른다)
      for (const sort of ['fire', 'water'] as const) {
        checkSorted(request({ required: hunger, minResistances: [{ element: 'fire', min: 8 }], sort }))
      }
    })

    it('모자란 조합 찾기도 정렬 속성 내성 순으로', () => {
      const required = req(['약점 특효', 5], ['도전자', 5], ['연격', 5], ['힘의 해방', 5], ['회피 성능', 5], ['회피 거리 UP', 3], ['체술', 3])
      expect(checkSorted(request({ required, maxShortfall: 99, sort: 'thunder' })).all.shortfall).toBe(7)
    })
  })

  it('제외한 방어구와 하위 랭크 방어구는 후보에 없다', () => {
    const excludedPiece = armorByName(db, '슈바르카그리브γ')
    const r = request({ required: req(['약점 특효', 4]), excludedArmorIds: [excludedPiece.id], limit: 100 })
    const res = runSearch(db, r)
    for (const item of res.items) {
      for (const ids of Object.values(item.armor)) {
        expect(ids).not.toContain(excludedPiece.id)
        for (const id of ids) expect(db.armor.get(id)!.rank).toBe('high')
      }
    }
    verify(r, res)
  })

  describe('모자란 조합 찾기', () => {
    const hunger = sid('쇄인룡의 굶주림')
    const lordsSoul = sid('주인의 혼')
    const gogma = weaponOf(dbWeaponChoice(db.weaponByGameKey('great-sword', 87)!.id, { setSkillId: hunger, groupSkillId: lordsSoul }))
    /** 레벨을 모두 합쳐 s 만큼 낮추는 모든 방법 (스킬별로 낮출 레벨) */
    const lowerings = (levels: readonly number[], s: number): number[][] => {
      if (levels.length === 0) return s === 0 ? [[]] : []
      const out: number[][] = []
      for (let l = 0; l <= Math.min(s, levels[0]); l++) {
        for (const rest of lowerings(levels.slice(1), s - l)) out.push([l, ...rest])
      }
      return out
    }

    it.each<[string, Partial<SearchRequest>, number]>([
      [
        '시리즈/그룹 스킬은 단계로 센다',
        { required: [{ skillId: hunger, level: 2 }, { skillId: lordsSoul, level: 1 }, ...req(['약점 특효', 5], ['도전자', 5], ['연격', 5])] },
        1,
      ],
      [
        '거극 아티어 무기가 센 부위',
        {
          required: [{ skillId: hunger, level: 2 }, { skillId: lordsSoul, level: 1 }, ...req(['약점 특효', 5], ['도전자', 5], ['뇌악룡의 투지', 2])],
          weapon: gogma,
        },
        1,
      ],
      ['장식주 없이', { required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3], ['회피 성능', 3]), useDecorations: false }, 1],
      [
        '무기 슬롯 장식주 (앙길바인 ③③③)',
        {
          required: req(['공격', 5], ['간파', 5], ['슈퍼회심', 3], ['약점 특효', 5], ['도전자', 5], ['연격', 5]),
          weapon: weaponOf({ type: 'db', id: 71 }),
        },
        4,
      ],
      [
        '고정한 스킬은 낮추지 않는다 (굶주림·연격 고정)',
        {
          required: [{ skillId: hunger, level: 2 }, { skillId: lordsSoul, level: 1 }, ...req(['약점 특효', 5], ['도전자', 5], ['연격', 5])],
          lockedSkills: [hunger, sid('연격')],
        },
        1,
      ],
      [
        '고정한 무기 스킬 (공격 고정)',
        {
          required: req(['공격', 5], ['간파', 5], ['슈퍼회심', 3], ['약점 특효', 5], ['도전자', 5], ['연격', 5]),
          weapon: weaponOf({ type: 'db', id: 71 }),
          lockedSkills: [sid('공격')],
        },
        5,
      ],
      [
        '장식주 없이 + 고정',
        {
          required: req(['약점 특효', 5], ['도전자', 5], ['연격', 3], ['회피 성능', 3]),
          useDecorations: false,
          lockedSkills: req(['약점 특효', 5], ['회피 성능', 3]).map((p) => p.skillId),
        },
        1,
      ],
      [
        // 여유분은 낮추지 않는다: Lv3 슬롯 3개를 비워 두려면 원하는 스킬을 낮춰야 한다
        '장식주 여유분 (방어구 ③×3)',
        { required: req(['약점 특효', 5], ['도전자', 5], ['연격', 5]), spareSlots: [3, 3, 3].map(() => armorSlot(3)) },
        1,
      ],
      [
        // 내성 조건도 낮추지 않는다: 용 내성 8 이상이면 원하는 스킬을 1레벨 낮춰야 한다
        '내성 조건 (용 ≥ 8)',
        { required: req(['약점 특효', 5], ['도전자', 5], ['연격', 5]), minResistances: [{ element: 'dragon', min: 8 }] },
        1,
      ],
    ])('%s: 레벨을 그만큼 낮춘 검색들에서 나오는 조합을 빠짐없이 찾는다', (_, overrides, expected) => {
      const r = request({ limit: 100_000, ...overrides })
      expect(runSearch(db, r).total).toBe(0)
      const relaxed = { ...r, maxShortfall: 99 }
      const res = runSearch(db, relaxed)
      expect(res.truncated).toBe(false)
      expect(res.shortfall).toBe(expected)
      // 덜 낮추면 결과가 없으므로, 레벨을 모두 합쳐 그만큼 낮춘 검색들의 결과를 합치면 정확히 그만큼 모자란 조합이 된다.
      // 고정한 스킬은 낮추지 않는다
      const union = new Set<string>()
      const lowerable = r.required.map((p) => (r.lockedSkills.includes(p.skillId) ? 0 : p.level))
      for (const lower of lowerings(lowerable, expected)) {
        const required = r.required.flatMap((p, i) => (p.level > lower[i] ? [{ ...p, level: p.level - lower[i] }] : []))
        const strict = runSearch(db, { ...r, required })
        expect(strict.truncated).toBe(false)
        for (const key of physical(strict.items)) union.add(key)
      }
      const found = physical(res.items)
      expect(new Set(found).size).toBe(found.length)
      expect(found.sort()).toEqual([...union].sort())
      verify(relaxed, { ...res, items: res.items.slice(0, 30) })
    })

    it('조건을 채우는 조합이 있으면 엄격 검색 결과 그대로', () => {
      const r = request({ required: req(['약점 특효', 5], ['도전자', 5], ['연격', 5], ['힘의 해방', 3]) })
      const strict = runSearch(db, r)
      const res = runSearch(db, { ...r, maxShortfall: 99 })
      expect(res.shortfall).toBe(0)
      expect(res.total).toBe(strict.total)
      expect(res.items.map((i) => i.id)).toEqual(strict.items.map((i) => i.id))
    })

    it('원하는 스킬을 모두 고정하면 엄격 검색과 같다', () => {
      const required = req(['약점 특효', 5], ['도전자', 5], ['연격', 5], ['힘의 해방', 5], ['회피 성능', 5], ['회피 거리 UP', 3], ['체술', 3])
      const res = runSearch(db, request({ required, maxShortfall: 99, lockedSkills: required.map((p) => p.skillId) }))
      expect(res).toMatchObject({ items: [], total: 0, shortfall: 0, truncated: false })
    })

    it('maxShortfall 이 0 이거나 그보다 많이 모자라면 결과가 없다', () => {
      const r = request({
        required: req(['공격', 5], ['간파', 5], ['슈퍼회심', 3], ['약점 특효', 5], ['도전자', 5], ['연격', 5]),
        weapon: weaponOf({ type: 'db', id: 71 }),
      })
      expect(runSearch(db, r)).toMatchObject({ items: [], total: 0, shortfall: 0 })
      expect(runSearch(db, { ...r, maxShortfall: 3 })).toMatchObject({ items: [], total: 0, shortfall: 0 })
      expect(runSearch(db, { ...r, maxShortfall: 4 }).shortfall).toBe(4)
    })

    it('많이 모자라도 가장 적게 모자란 조합을 정렬 기준대로 찾는다', () => {
      const required = req(['약점 특효', 5], ['도전자', 5], ['연격', 5], ['힘의 해방', 5], ['회피 성능', 5], ['회피 거리 UP', 3], ['체술', 3])
      const r = request({ required, maxShortfall: 99, limit: 50 })
      const res = runSearch(db, r)
      expect(res.shortfall).toBe(7)
      expect(runSearch(db, { ...r, maxShortfall: 6 }).total).toBe(0)
      verify(r, res)
      const scores = res.items.map((i) => slotScore(i.freeSlots))
      expect(scores).toEqual([...scores].sort((a, b) => b - a))
      const byDefense = runSearch(db, { ...r, sort: 'defense' })
      expect(byDefense.shortfall).toBe(7)
      const defenses = byDefense.items.map((i) => i.defense)
      expect(defenses).toEqual([...defenses].sort((a, b) => b - a))
    })

    it('두 번째 검색의 진행률은 relaxed 로 알린다', () => {
      const progress: SearchProgress[] = []
      runSearch(db, request({ required: req(['쇄인룡의 굶주림', 2], ['주인의 혼', 1], ['약점 특효', 5], ['도전자', 5], ['연격', 5]), maxShortfall: 99 }), {
        onProgress: (p) => progress.push(p),
      })
      expect(progress.some((p) => !p.relaxed)).toBe(true)
      expect(progress.at(-1)).toMatchObject({ ratio: 1, relaxed: true })
    })
  })
})

describe('일반화된 경로 (합성 데이터)', () => {
  // 실제 데이터에는 없지만 엔진이 가정 없이 동작하는지 확인:
  // 방어구·무기 장식주 양쪽에 있는 스킬(both 풀), 방어구가 무기 풀 스킬을 주는 경우
  const names = (ko: string) => ({ ko, en: ko, ja: ko })
  const skill = (id: number, kind: Skill['kind'], maxLevel: number): Skill => ({
    id,
    gameId: id,
    kind,
    name: names(`s${id}`),
    description: '',
    iconKind: null,
    maxLevel,
    ranks: Array.from({ length: maxLevel }, (_, i) => ({ level: i + 1, description: '' })),
  })
  const resist = { fire: 0, water: 0, thunder: 0, ice: 0, dragon: 0 }
  const kinds = ['head', 'chest', 'arms', 'waist', 'legs'] as const
  const data: GameData = {
    meta: { source: 'test', mhdbVersion: 'test', generatedAt: '', locales: ['ko', 'en', 'ja'] },
    skills: [skill(1, 'armor', 5), skill(2, 'weapon', 3), skill(3, 'armor', 3)],
    armorSets: [{ id: 1, gameId: 1, name: names('set'), pieceIds: [1, 2, 3, 4, 5, 6] }],
    armor: [
      ...kinds.map((kind, i) => ({
        id: i + 1,
        kind,
        name: names(`a${i + 1}`),
        rank: 'high' as const,
        rarity: 8,
        defense: { base: 10, max: 20 },
        resistances: resist,
        skills: [{ skillId: 1, level: 1 }],
        bonusSkillIds: [],
        slots: [2, 1] as (1 | 2 | 3)[],
        setId: 1,
      })),
      // 무기 스킬(2)을 주는 방어구
      {
        id: 6,
        kind: 'head' as const,
        name: names('a6'),
        rank: 'high' as const,
        rarity: 8,
        defense: { base: 5, max: 5 },
        resistances: resist,
        skills: [{ skillId: 2, level: 1 }],
        bonusSkillIds: [],
        slots: [] as (1 | 2 | 3)[],
        setId: 1,
      },
    ],
    decorations: [
      { id: 1, gameId: 1, name: names('d-armor-s3'), kind: 'armor', size: 1, rarity: 1, skills: [{ skillId: 3, level: 1 }] },
      { id: 2, gameId: 2, name: names('d-weapon-s3'), kind: 'weapon', size: 1, rarity: 1, skills: [{ skillId: 3, level: 1 }] },
      { id: 3, gameId: 3, name: names('d-weapon-s2'), kind: 'weapon', size: 2, rarity: 1, skills: [{ skillId: 2, level: 1 }] },
    ],
    talismans: [],
    weapons: [
      {
        id: 1,
        gameId: 1,
        kind: 'bow',
        name: names('w'),
        rarity: 8,
        attack: 0,
        affinity: 0,
        defenseBonus: 0,
        specials: [],
        skills: [],
        slots: [2, 1],
      },
    ],
  }
  const synthetic = new GameDb(data)

  it('양쪽 장식주가 있는 스킬과 방어구의 무기 스킬을 함께 계산한다', () => {
    const r: SearchRequest = {
      required: [
        { skillId: 1, level: 4 },
        { skillId: 2, level: 2 },
        { skillId: 3, level: 3 },
      ],
      excludedSkills: [],
      excludeMode: 'mark',
      weapon: { choice: { type: 'db', id: 1 }, skills: [], slots: [2, 1] },
      talismans: [],
      includeLowRank: false,
      transcend: false,
      useDecorations: true,
      excludedArmorIds: [],
      sort: 'slots',
      limit: 10,
      maxShortfall: 0,
      lockedSkills: [],
      spareSlots: [],
      minResistances: [],
    }
    const res = runSearch(synthetic, r)
    expect(res.items.length).toBeGreaterThan(0)
    for (const item of res.items) {
      const summary = computeBuild(synthetic, resultToBuild(synthetic, item, r))
      expect(missingRequirements(summary, r.required)).toEqual([])
      expect(summary.slots.every((s) => s.valid)).toBe(true)
      expect(slotKey(summary.freeSlots)).toEqual(slotKey(item.freeSlots))
    }
  })

  it('모자란 조합 찾기: 비선호 장식주로 덜 모자라지면 표시만 모드에서 쓴다', () => {
    // 무기 슬롯 Lv1 하나에 스킬 2 를 3레벨 채울 수 없다. 깨끗한 장식주는 1, 비선호 스킬 4 가 붙은 장식주는 2
    const small: GameData = {
      ...data,
      skills: [...data.skills, skill(4, 'weapon', 1)],
      armor: data.armor.filter((a) => a.id <= 5).map((a) => ({ ...a, skills: [], slots: [] })),
      decorations: [
        { id: 1, gameId: 1, name: names('clean'), kind: 'weapon', size: 1, rarity: 1, skills: [{ skillId: 2, level: 1 }] },
        {
          id: 2,
          gameId: 2,
          name: names('dirty'),
          kind: 'weapon',
          size: 1,
          rarity: 1,
          skills: [
            { skillId: 2, level: 2 },
            { skillId: 4, level: 1 },
          ],
        },
      ],
      weapons: [{ ...data.weapons[0], slots: [1] }],
    }
    const smallDb = new GameDb(small)
    const r: SearchRequest = {
      required: [{ skillId: 2, level: 3 }],
      excludedSkills: [4],
      excludeMode: 'mark',
      weapon: { choice: { type: 'db', id: 1 }, skills: [], slots: [1] },
      talismans: [],
      includeLowRank: false,
      transcend: false,
      useDecorations: true,
      excludedArmorIds: [],
      sort: 'slots',
      limit: 10,
      maxShortfall: 99,
      lockedSkills: [],
      spareSlots: [],
      minResistances: [],
    }
    expect(runSearch(smallDb, { ...r, maxShortfall: 0 }).total).toBe(0)
    const marked = runSearch(smallDb, r)
    expect(marked.shortfall).toBe(1)
    expect(marked.items.map((i) => i.unwantedSkills)).toEqual([[4]])
    const excluded = runSearch(smallDb, { ...r, excludeMode: 'exclude' })
    expect(excluded.shortfall).toBe(2)
    expect(excluded.items.map((i) => i.unwantedSkills)).toEqual([[]])
    for (const res of [marked, excluded]) {
      const summary = computeBuild(smallDb, resultToBuild(smallDb, res.items[0], r))
      expect(missingRequirements(summary, r.required)).toEqual([{ skillId: 2, required: 3, current: 3 - res.shortfall }])
    }
  })

  it('장식주 여유분: 남는 슬롯 점수가 가장 큰 배치에 안 들어가면 다른 장식주로 여유분을 남긴다', () => {
    // 무기 슬롯 [3,1,1] 에 스킬 2·5 를 Lv1 장식주 둘로 채우면 Lv3 이 남고(점수 9), 둘을 함께 주는 Lv3 장식주면 Lv1 둘이 남는다
    const composite: GameData = {
      ...data,
      skills: [...data.skills, skill(5, 'weapon', 1)],
      armor: data.armor.filter((a) => a.id <= 5).map((a) => ({ ...a, skills: [], slots: [] })),
      decorations: [
        { id: 1, gameId: 1, name: names('s2'), kind: 'weapon', size: 1, rarity: 1, skills: [{ skillId: 2, level: 1 }] },
        { id: 2, gameId: 2, name: names('s5'), kind: 'weapon', size: 1, rarity: 1, skills: [{ skillId: 5, level: 1 }] },
        {
          id: 3,
          gameId: 3,
          name: names('s2+s5'),
          kind: 'weapon',
          size: 3,
          rarity: 1,
          skills: [
            { skillId: 2, level: 1 },
            { skillId: 5, level: 1 },
          ],
        },
      ],
      weapons: [{ ...data.weapons[0], slots: [3, 1, 1] }],
    }
    const compositeDb = new GameDb(composite)
    const r: SearchRequest = {
      required: [
        { skillId: 2, level: 1 },
        { skillId: 5, level: 1 },
      ],
      excludedSkills: [],
      excludeMode: 'mark',
      weapon: { choice: { type: 'db', id: 1 }, skills: [], slots: [3, 1, 1] },
      talismans: [],
      includeLowRank: false,
      transcend: false,
      useDecorations: true,
      excludedArmorIds: [],
      sort: 'slots',
      limit: 10,
      maxShortfall: 0,
      lockedSkills: [],
      spareSlots: [],
      minResistances: [],
    }
    const freeOf = (spareSlots: Slot[]) => {
      const res = runSearch(compositeDb, { ...r, spareSlots })
      return res.items.map((item) => {
        const summary = computeBuild(compositeDb, resultToBuild(compositeDb, item, r))
        expect(missingRequirements(summary, r.required)).toEqual([])
        expect(summary.slots.every((s) => s.valid)).toBe(true)
        expect(slotKey(summary.freeSlots)).toEqual(slotKey(item.freeSlots))
        return slotKey(item.freeSlots).join('')
      })
    }
    expect(freeOf([])).toEqual(['w3'])
    expect(freeOf([weaponSlot(3)])).toEqual(['w3'])
    expect(freeOf([weaponSlot(1), weaponSlot(1)])).toEqual(['w1w1'])
    // 슬롯 둘을 비우면서 Lv3 를 남기는 배치는 없다
    expect(freeOf([weaponSlot(3), weaponSlot(1)])).toEqual([])
  })
})
