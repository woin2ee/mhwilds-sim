import { describe, expect, it } from 'vitest'
import { GameDb } from '../../data/db'
import type { GameData, Skill } from '../../data/types'
import { armorByName, loadTestDb, skillIdByName } from '../../test/testDb'
import { activeSkillLevels, computeBuild, missingRequirements, unwantedSkillsOf } from '../calc'
import { resolveWeapon } from '../equipment'
import type { CustomTalisman, Slot, WeaponChoice } from '../types'
import { runSearch } from './engine'
import { resultToBuild } from './toBuild'
import type { SearchRequest, SearchResponse, SearchResultItem, SearchTalisman } from './types'

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
    excludeMode: 'deprioritize',
    weapon: weaponOf(null),
    talismans: fixedTalismans,
    includeLowRank: false,
    transcend: false,
    excludedArmorIds: [],
    sort: 'slots',
    limit: 30,
    ...overrides,
  }
}

const slotKey = (slots: readonly Slot[]) => slots.map((s) => `${s.kind[0]}${s.level}`).sort()
const slotScore = (slots: readonly Slot[]) => slots.reduce((sum, s) => sum + s.level * s.level, 0)

/** 결과 하나를 computeBuild 로 다시 계산해 엔진이 준 값과 맞는지 확인 */
function verifyItem(
  r: SearchRequest,
  item: SearchResultItem,
  customs: CustomTalisman[],
  variant: Parameters<typeof resultToBuild>[3] = {},
) {
  const summary = computeBuild(db, resultToBuild(db, item, r, variant), customs)
  expect(missingRequirements(summary, r.required)).toEqual([])
  expect(summary.slots.every((s) => s.valid)).toBe(true)
  expect(unwantedSkillsOf(summary, r.excludedSkills).sort()).toEqual([...item.unwantedSkills].sort())
  return summary
}

/** 응답의 모든 결과(+ 앞쪽 몇 개의 대체 방어구/호석)를 재검증 */
function verify(r: SearchRequest, res: SearchResponse, customs: CustomTalisman[] = []) {
  const all = [...res.preferred.map((i) => [i, false] as const), ...res.deprioritized.map((i) => [i, true] as const)]
  for (const [item, deprioritized] of all) {
    const summary = verifyItem(r, item, customs)
    expect(item.unwantedSkills.length > 0).toBe(deprioritized)
    expect(slotKey(summary.freeSlots)).toEqual(slotKey(item.freeSlots))
    expect(summary.defense.max).toBe(item.defense)
    const levels = activeSkillLevels(summary)
    for (const { skillId } of r.required) {
      expect(item.skillLevels.find((s) => s.skillId === skillId)?.level).toBe(levels.get(skillId))
    }
    expect(item.variantCount).toBe(Object.values(item.armor).reduce((n, ids) => n * Math.max(1, ids.length), 1))
    // 같은 결과로 묶인 대체 방어구·호석도 같은 장식주 배치로 조건을 만족해야 한다
    for (const [kind, ids] of Object.entries(item.armor)) {
      for (const id of ids.slice(1, 4)) verifyItem(r, item, customs, { [kind]: id })
    }
    item.talismans.slice(1, 4).forEach((_, i) => verifyItem(r, item, customs, { talismanIndex: i + 1 }))
  }
  expect(res.preferred.length).toBeLessThanOrEqual(r.limit)
  expect(res.deprioritized.length).toBeLessThanOrEqual(r.limit)
  expect(res.totalPreferred).toBeGreaterThanOrEqual(res.preferred.length)
  expect(res.totalDeprioritized).toBeGreaterThanOrEqual(res.deprioritized.length)
  expect(new Set(all.map(([i]) => i.id)).size).toBe(all.length)
}

describe('runSearch', () => {
  it('요구 스킬이 없으면 빈 결과', () => {
    const res = runSearch(db, request({}))
    expect(res).toMatchObject({ preferred: [], deprioritized: [], totalPreferred: 0, truncated: false })
  })

  it('방어구 스킬 검색 결과가 모두 computeBuild 재검증을 통과한다', () => {
    const r = request({ required: req(['약점 특효', 5], ['도전자', 3], ['회피 성능', 2]), limit: 40 })
    const res = runSearch(db, r)
    expect(res.preferred.length).toBe(40)
    verify(r, res)
  })

  it('시리즈 스킬 2단계: 같은 시리즈 4부위 이상', () => {
    const setSkill = sid('쇄인룡의 굶주림')
    const r = request({ required: [{ skillId: setSkill, level: 2 }, ...req(['약점 특효', 3])] })
    const res = runSearch(db, r)
    expect(res.preferred.length).toBeGreaterThan(0)
    verify(r, res)
    for (const item of res.preferred) {
      const summary = computeBuild(db, resultToBuild(db, item, r))
      expect(summary.bonuses.find((b) => b.skillId === setSkill)?.pieces).toBeGreaterThanOrEqual(4)
    }
  })

  it('그룹 스킬: 3부위 이상', () => {
    const r = request({ required: req(['주인의 혼', 1], ['약점 특효', 3]) })
    const res = runSearch(db, r)
    expect(res.preferred.length).toBeGreaterThan(0)
    verify(r, res)
  })

  describe('비선호 스킬', () => {
    const required = req(['약점 특효', 5], ['도전자', 5], ['연격', 3])
    const excludedSkills = [sid('공세')]

    it('exclude 모드: 방어구·호석·장식주 어디에도 비선호 스킬이 없다', () => {
      const r = request({ required, excludedSkills, excludeMode: 'exclude' })
      const res = runSearch(db, r)
      expect(res.preferred.length).toBeGreaterThan(0)
      expect(res.deprioritized).toEqual([])
      expect(res.totalDeprioritized).toBe(0)
      verify(r, res)
      for (const item of res.preferred) {
        for (const ids of Object.values(item.armor)) {
          for (const id of ids) expect(db.armor.get(id)!.skills.some((s) => excludedSkills.includes(s.skillId))).toBe(false)
        }
      }
    })

    it('deprioritize 모드: 깨끗한 결과와 비선호 결과를 나누고, 깨끗한 결과 수는 exclude 모드와 같다', () => {
      const r = request({ required, excludedSkills, excludeMode: 'deprioritize' })
      const res = runSearch(db, r)
      const excluded = runSearch(db, { ...r, excludeMode: 'exclude' })
      expect(res.totalDeprioritized).toBeGreaterThan(0)
      expect(res.deprioritized.every((i) => i.unwantedSkills.includes(excludedSkills[0]))).toBe(true)
      expect(res.totalPreferred).toBe(excluded.totalPreferred)
      verify(r, res)
    })

    it('무기 자체 스킬은 비선호로 세지 않는다', () => {
      const choice: WeaponChoice = { type: 'db', id: 6 } // 허무의 활Ⅰ: 집중 Lv2, 슬롯 [1]
      expect(db.weapons.get(6)!.skills.map((s) => s.skillId)).toContain(sid('집중'))
      const r = request({ required, weapon: weaponOf(choice), excludedSkills: [sid('집중')] })
      const res = runSearch(db, r)
      const plain = runSearch(db, { ...r, excludedSkills: [] })
      expect(res.totalDeprioritized).toBe(0)
      expect(res.totalPreferred).toBe(plain.totalPreferred)
      verify(r, res)
    })
  })

  describe('무기 스킬', () => {
    it('무기 슬롯 장식주로 무기 스킬을 채운다', () => {
      const r = request({ required: req(['공격', 5], ['약점 특효', 2]), weapon: weaponOf({ type: 'db', id: 71 }) }) // 앙길바인 [3,3,3]
      const res = runSearch(db, r)
      expect(res.preferred.length).toBeGreaterThan(0)
      verify(r, res)
      expect(runSearch(db, { ...r, weapon: weaponOf(null) }).totalPreferred).toBe(0)
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
      expect(res.preferred.length).toBeGreaterThan(0)
      verify(r, res, [t.custom])
      for (const item of res.preferred) {
        expect(item.talismans[0]).toEqual({ type: 'custom', id: 'weapon-slot' })
        expect(item.decorations.talisman[0]).not.toBeNull()
      }
      expect(runSearch(db, { ...r, talismans: fixedTalismans }).totalPreferred).toBe(0)
    })
  })

  it('방어구 초월: 초월 슬롯으로만 가능한 조합을 찾는다', () => {
    const highRarity = db.data.armor.filter((a) => a.rarity >= 7).map((a) => a.id)
    const r = request({ required: req(['약점 특효', 5], ['도전자', 5]), excludedArmorIds: highRarity, talismans: [] })
    expect(runSearch(db, r).totalPreferred).toBe(0)
    const transcended = { ...r, transcend: true }
    const res = runSearch(db, transcended)
    expect(res.preferred.length).toBeGreaterThan(0)
    verify(transcended, res)
  })

  it('도움이 되는 사용자 호석을 사용한다', () => {
    const t = custom('we-burst', [['약점 특효', 2], ['연격', 1]], [{ kind: 'armor', level: 3 }])
    const r = request({ required: req(['약점 특효', 5], ['도전자', 5], ['연격', 5]), talismans: [] })
    expect(runSearch(db, r).totalPreferred).toBe(0)
    const withCustom = { ...r, talismans: [...fixedTalismans, t.search] }
    const res = runSearch(db, withCustom)
    expect(res.preferred.length).toBeGreaterThan(0)
    expect(res.preferred[0].talismans[0]).toEqual({ type: 'custom', id: 'we-burst' })
    verify(withCustom, res, [t.custom])
  })

  it('불가능한 요청은 빠르게 빈 결과를 돌려준다', () => {
    const impossible = request({
      required: req(['약점 특효', 5], ['도전자', 5], ['연격', 5], ['힘의 해방', 5], ['앙심', 5], ['완전 충전', 5], ['공세', 5]),
    })
    const res = runSearch(db, impossible)
    expect(res.totalPreferred + res.totalDeprioritized).toBe(0)
    expect(res.truncated).toBe(false)
    expect(res.elapsedMs).toBeLessThan(3000)
    // 특정 무기에만 붙는 스킬: 무기 없이 검색하면 얻을 방법이 없다
    expect(runSearch(db, request({ required: req(['암흑', 1], ['약점 특효', 1]) })).totalPreferred).toBe(0)
  })

  it('limit 과 정렬 기준을 지킨다', () => {
    const base = request({ required: req(['약점 특효', 3], ['회피 성능', 2]), limit: 10 })
    const bySlots = runSearch(db, base)
    expect(bySlots.preferred).toHaveLength(10)
    const scores = bySlots.preferred.map((i) => slotScore(i.freeSlots))
    expect(scores).toEqual([...scores].sort((a, b) => b - a))

    const byDefense = runSearch(db, { ...base, sort: 'defense' })
    const defenses = byDefense.preferred.map((i) => i.defense)
    expect(defenses).toEqual([...defenses].sort((a, b) => b - a))
    expect(defenses[0]).toBeGreaterThanOrEqual(Math.max(...bySlots.preferred.map((i) => i.defense)))
    verify(base, bySlots)
    verify({ ...base, sort: 'defense' }, byDefense)
  })

  it('탐색 상한·중단 요청에 걸리면 truncated', () => {
    const r = request({ required: req(['약점 특효', 1]) })
    const limited = runSearch(db, r, { limits: { maxLeaves: 100 } })
    expect(limited.truncated).toBe(true)
    expect(limited.totalPreferred).toBeLessThanOrEqual(100)
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

  it('제외한 방어구와 하위 랭크 방어구는 후보에 없다', () => {
    const excludedPiece = armorByName(db, '슈바르카그리브γ')
    const r = request({ required: req(['약점 특효', 4]), excludedArmorIds: [excludedPiece.id], limit: 100 })
    const res = runSearch(db, r)
    for (const item of res.preferred) {
      for (const ids of Object.values(item.armor)) {
        expect(ids).not.toContain(excludedPiece.id)
        for (const id of ids) expect(db.armor.get(id)!.rank).toBe('high')
      }
    }
    verify(r, res)
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
    armorSets: [{ id: 1, gameId: 1, name: names('set'), setSkillId: null, groupSkillId: null, pieceIds: [1, 2, 3, 4, 5, 6] }],
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
      excludeMode: 'deprioritize',
      weapon: { choice: { type: 'db', id: 1 }, skills: [], slots: [2, 1] },
      talismans: [],
      includeLowRank: false,
      transcend: false,
      excludedArmorIds: [],
      sort: 'slots',
      limit: 10,
    }
    const res = runSearch(synthetic, r)
    expect(res.preferred.length).toBeGreaterThan(0)
    for (const item of res.preferred) {
      const summary = computeBuild(synthetic, resultToBuild(synthetic, item, r))
      expect(missingRequirements(summary, r.required)).toEqual([])
      expect(summary.slots.every((s) => s.valid)).toBe(true)
      expect(slotKey(summary.freeSlots)).toEqual(slotKey(item.freeSlots))
    }
  })
})
