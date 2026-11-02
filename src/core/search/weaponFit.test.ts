import { describe, expect, it } from 'vitest'
import type { SkillPoint, SlotLevel } from '../../data/types'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import type { Slot } from '../types'
import { runSearch } from './engine'
import type { ExcludeMode, SearchTalisman } from './types'
import { WeaponSkillFit, type WeaponFitInput, type WeaponSkillSource } from './weaponFit'

const db = loadTestDb()
const sid = (name: string) => skillIdByName(db, name)
const source = (weaponSlots: SlotLevel[], skills: SkillPoint[] = []): WeaponSkillSource => ({ skills, weaponSlots })
const allWeapons = db.data.weapons.map((w) => source(w.slots, w.skills))
const fixedTalismans = db.data.talismans.filter((t) => t.isMaxRank).map((t) => source([], t.skills))

/** pairs 를 함께 띄울 수 있는지 (기본: 무기 슬롯 [3,3,3], 제작 호석) */
function fits(pairs: [string, number][], input: Partial<WeaponFitInput> = {}): boolean {
  const fit = new WeaponSkillFit(db, {
    skillIds: pairs.map(([name]) => sid(name)),
    weapons: [source([3, 3, 3])],
    talismans: fixedTalismans,
    useDecorations: true,
    excludedSkills: [],
    excludeMode: 'mark',
    spare: [0, 0, 0],
    ...input,
  })
  return fit.fits(pairs.map(([, level]) => level))
}

const FOUR: [string, number][] = [
  ['명검', 3],
  ['용속성 공격 강화', 3],
  ['집중', 3],
  ['고속 변형', 3],
]

/** mulberry32: 실패하면 같은 사례로 다시 볼 수 있게 고정 시드 */
function randomOf(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('무기 스킬 함께 띄우기 판정 (WeaponSkillFit)', () => {
  it('무기 슬롯 [3,3,3] 이면 Lv1 쪽이 같은 3-1 장식주 셋으로 Lv3 스킬 넷까지 띄운다', () => {
    expect(fits(FOUR)).toBe(true) // 명검-파룡주·집중-파룡주·속변-파룡주
    expect(fits([...FOUR, ['회심격【속성】', 1]])).toBe(false)
    // 높은 레벨은 슬롯을 더 쓴다: 간파5 는 달인주Ⅲ + 달인주Ⅱ
    expect(fits([['간파', 3], ['명검', 3], ['집중', 3]])).toBe(true)
    expect(fits([['간파', 5], ['명검', 3], ['집중', 3]])).toBe(false)
  })

  it('슬롯이 적은 무기는 그만큼만 띄운다', () => {
    const weapons = [source([3, 2, 1])]
    expect(fits([['명검', 3], ['용속성 공격 강화', 3]], { weapons })).toBe(true) // 명검-파룡주 + 파룡주Ⅱ
    expect(fits([['명검', 3], ['용속성 공격 강화', 3], ['집중', 1]], { weapons })).toBe(true)
    expect(fits([['명검', 3], ['용속성 공격 강화', 3], ['집중', 3]], { weapons })).toBe(false)
  })

  it('무기 후보가 여럿이면 하나로라도 띄우면 되고, 무기에 붙은 스킬도 센다', () => {
    // 깨진 봉인거울의 검【용와】: 슬롯 [3,3,3] + 집중3 이라 집중을 더해 Lv3 다섯
    expect(fits([...FOUR, ['회심격【속성】', 3]], { weapons: allWeapons })).toBe(true)
    const noFocus: [string, number][] = [
      ['명검', 3],
      ['용속성 공격 강화', 3],
      ['고속 변형', 3],
      ['회심격【속성】', 3],
    ]
    expect(fits(noFocus, { weapons: allWeapons })).toBe(true)
    expect(fits([...noFocus, ['불속성 공격 강화', 3]], { weapons: allWeapons })).toBe(false)
    // 장식주가 없는 무기 전용 스킬은 그 스킬이 붙은 무기로만
    expect(fits([['물에 젖은 명검', 3]], { weapons: allWeapons })).toBe(true)
    expect(fits([['물에 젖은 명검', 3]])).toBe(false)
  })

  it('무기가 없으면 호석의 무기 스킬·무기 슬롯으로만 띄우고, 호석은 후보 중 하나만 쓴다', () => {
    expect(fits([['명검', 1]], { weapons: [] })).toBe(false)
    expect(fits([['명검', 1]], { weapons: [], talismans: [...fixedTalismans, source([1])] })).toBe(true) // 명검주【1】
    const talismans = [source([], [{ skillId: sid('명검'), level: 1 }]), source([1])]
    expect(fits([['명검', 1], ['간파', 1]], { weapons: [], talismans })).toBe(false)
    expect(fits([...FOUR, ['회심격【속성】', 1]], { talismans: [source([1])] })).toBe(true) // 속회주【1】
  })

  it('장식주 없이 찾으면 무기·호석에 붙은 스킬만 센다', () => {
    expect(fits([['집중', 3]], { useDecorations: false })).toBe(false)
    expect(fits([['집중', 3]], { useDecorations: false, weapons: allWeapons })).toBe(true)
  })

  it('아예 제외 모드면 비선호 스킬이 붙은 장식주·호석을 쓰지 않는다', () => {
    // 피리 명인2 는 Lv3 슬롯 하나로는 복합 장식주(고적-공격주 …)로만 띄운다 (고적주【2】는 Lv1)
    const excludedSkills = ['공격', 'KO술', '간파', '발도술【기】', '장인'].map(sid)
    const weapons = [source([3])]
    expect(fits([['피리 명인', 2]], { weapons, excludedSkills, excludeMode: 'mark' })).toBe(true)
    expect(fits([['피리 명인', 2]], { weapons, excludedSkills, excludeMode: 'exclude' })).toBe(false)
    const talismans = [
      source([], [
        { skillId: sid('회심격【속성】'), level: 1 },
        { skillId: sid('회피 성능'), level: 1 },
      ]),
    ]
    const withTalisman = { talismans, excludedSkills: [sid('회피 성능')] }
    expect(fits([...FOUR, ['회심격【속성】', 1]], { ...withTalisman, excludeMode: 'mark' })).toBe(true)
    expect(fits([...FOUR, ['회심격【속성】', 1]], { ...withTalisman, excludeMode: 'exclude' })).toBe(false)
  })

  it('무기 장식주 여유분만큼 슬롯을 비워 둔다 (어느 무기에도 안 들어가는 여유분은 무기 스킬과 상관없어 뺀다)', () => {
    expect(fits([['명검', 3], ['집중', 3]], { spare: [0, 0, 1] })).toBe(true)
    expect(fits([['명검', 3], ['집중', 3], ['고속 변형', 3]], { spare: [0, 0, 1] })).toBe(false)
    expect(fits(FOUR, { spare: [0, 0, 4] })).toBe(true)
  })

  it('무기 후보를 줄여도 무기마다 따로 본 것과 같다 (무작위)', () => {
    const random = randomOf(20261102)
    const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]
    const weaponSkills = db.data.skills.filter((s) => s.kind === 'weapon')
    const builtIn = [...new Set(db.data.weapons.flatMap((w) => w.skills.map((s) => s.skillId)))]
    for (let round = 0; round < 30; round++) {
      const weapons = Array.from({ length: 150 }, () => pick(allWeapons))
      const levels = new Map<number, number>()
      while (levels.size < 2 + Math.floor(random() * 4)) {
        const id = random() < 0.5 ? pick(builtIn) : pick(weaponSkills).id
        levels.set(id, 1 + Math.floor(random() * db.skill(id).maxLevel))
      }
      const base: WeaponFitInput = {
        skillIds: [...levels.keys()],
        weapons,
        talismans: random() < 0.5 ? [source([1], [{ skillId: pick(weaponSkills).id, level: 1 }]), source([])] : [],
        useDecorations: random() < 0.8,
        excludedSkills: [],
        excludeMode: 'mark',
        spare: random() < 0.2 ? [1, 0, 0] : [0, 0, 0],
      }
      const want = [...levels.values()]
      const each = weapons.some((w) => new WeaponSkillFit(db, { ...base, weapons: [w] }).fits(want))
      expect(new WeaponSkillFit(db, base).fits(want), `round ${round}`).toBe(each)
    }
  })

  it('무기 스킬만 원할 때 검색 엔진이 결과를 찾는지와 같다 (무작위)', () => {
    const random = randomOf(20261103)
    const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]
    const weaponSkills = db.data.skills.filter((s) => s.kind === 'weapon')
    const decoSkillIds = new Set(
      db.data.decorations.filter((d) => d.kind === 'weapon').flatMap((d) => d.skills.map((s) => s.skillId)),
    )
    const withDeco = weaponSkills.filter((s) => decoSkillIds.has(s.id))
    const artian = db.data.weapons.find((w) => w.slots.join() === '3,3,3' && w.skills.length === 0)!
    const fixed: SearchTalisman[] = db.data.talismans
      .filter((t) => t.isMaxRank)
      .map((t) => ({ ref: { type: 'fixed', id: t.id }, skills: t.skills, slots: [] }))
    let found = 0
    for (let round = 0; round < 60; round++) {
      const weapon = random() < 0.3 ? artian : pick(db.data.weapons)
      const levels = new Map<number, number>()
      // 무기에 붙은 스킬도 섞는다
      if (weapon.skills.length > 0 && random() < 0.5) {
        const point = pick(weapon.skills)
        levels.set(point.skillId, 1 + Math.floor(random() * db.skill(point.skillId).maxLevel))
      }
      const count = 1 + Math.floor(random() * 5)
      while (levels.size < count) {
        const skill = random() < 0.9 ? pick(withDeco) : pick(weaponSkills)
        levels.set(skill.id, 1 + Math.floor(random() * skill.maxLevel))
      }
      const required = [...levels].map(([skillId, level]) => ({ skillId, level }))
      const talismans = [...fixed]
      if (random() < 0.4) {
        const slots: Slot[] = random() < 0.5 ? [{ kind: 'weapon', level: 1 }] : []
        const skills = [{ skillId: pick(withDeco).id, level: 1 + Math.floor(random() * 2) }]
        talismans.push({ ref: { type: 'custom', id: 'mine' }, skills, slots })
      }
      const useDecorations = random() < 0.9
      const excludeMode: ExcludeMode = random() < 0.2 ? 'exclude' : 'mark'
      const excludedSkills = random() < 0.3 ? [pick(withDeco.filter((s) => !levels.has(s.id))).id] : []
      // 무기 Lv3 여유분은 무기에 Lv3 슬롯이 있을 때만 (어디에도 안 들어가면 판정에서 빼서 엔진과 다르다)
      const spare = random() < 0.2 && weapon.slots.includes(3)
      const response = runSearch(db, {
        required,
        excludedSkills,
        excludeMode,
        weapon: { choice: { type: 'db', id: weapon.id }, skills: weapon.skills, slots: weapon.slots },
        talismans,
        includeLowRank: false,
        transcend: false,
        useDecorations,
        excludedArmorIds: [],
        sort: 'slots',
        limit: 1,
        maxShortfall: 0,
        lockedSkills: [],
        spareSlots: spare ? [{ kind: 'weapon', level: 3 }] : [],
        minResistances: [],
      })
      const fit = new WeaponSkillFit(db, {
        skillIds: required.map((r) => r.skillId),
        weapons: [source(weapon.slots, weapon.skills)],
        talismans: talismans.map((t) => source(t.slots.filter((s) => s.kind === 'weapon').map((s) => s.level), t.skills)),
        useDecorations,
        excludedSkills,
        excludeMode,
        spare: spare ? [0, 0, 1] : [0, 0, 0],
      })
      expect(response.truncated).toBe(false)
      expect(fit.fits(required.map((r) => r.level)), `round ${round}`).toBe(response.total > 0)
      if (response.total > 0) found++
    }
    // 되는 경우와 안 되는 경우가 고루 섞였는지
    expect(found).toBeGreaterThan(10)
    expect(found).toBeLessThan(50)
  })
})
