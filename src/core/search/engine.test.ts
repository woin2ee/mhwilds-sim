import { describe, expect, it } from 'vitest'
import { GameDb } from '../../data/db'
import { ARMOR_KINDS, type GameData, type Skill, type SkillPoint } from '../../data/types'
import { armorByName, loadTestDb, skillIdByName } from '../../test/testDb'
import { activeSkillLevels, computeBuild, missingRequirements, unwantedSkillsOf } from '../calc'
import { resolveWeapon } from '../equipment'
import { customWeaponChoice, dbWeaponChoice, type GogmaSkills } from '../gogmaArtian'
import type { CustomTalisman, Slot, WeaponChoice } from '../types'
import { runSearch } from './engine'
import { resultToBuild } from './toBuild'
import type { SearchProgress, SearchRequest, SearchResponse, SearchResultItem, SearchTalisman } from './types'

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
  return summary
}

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
    expect(item.variantCount).toBe(Object.values(item.armor).reduce((n, ids) => n * Math.max(1, ids.length), 1))
    // 같은 결과로 묶인 대체 방어구·호석도 같은 장식주 배치로 조건을 만족해야 한다
    for (const [kind, ids] of Object.entries(item.armor)) {
      for (const id of ids.slice(1, 4)) verifyItem(r, item, customs, { [kind]: id }, res.shortfall)
    }
    item.talismans.slice(1, 4).forEach((_, i) => verifyItem(r, item, customs, { talismanIndex: i + 1 }, res.shortfall))
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
    const limited = runSearch(db, r, { limits: { maxLeaves: 100 } })
    expect(limited.truncated).toBe(true)
    expect(limited.total).toBeLessThanOrEqual(100)
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
    /** 결과를 실제 방어구·호석 조합으로 펼친 키 */
    const physical = (items: readonly SearchResultItem[]) =>
      items.flatMap((item) => {
        let combos = ['']
        for (const kind of ARMOR_KINDS) {
          const ids = item.armor[kind].length > 0 ? item.armor[kind] : [0]
          combos = combos.flatMap((c) => ids.map((id) => `${c}${id},`))
        }
        const talismans = item.talismans.length > 0 ? item.talismans.map((t) => `${t.type}:${t.id}`) : ['-']
        return combos.flatMap((c) => talismans.map((t) => c + t))
      })
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
})
