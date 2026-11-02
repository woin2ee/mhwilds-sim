import { describe, expect, it } from 'vitest'
import { loadTestDb } from '../test/testDb'
import { ELEMENTS, WEAPON_KINDS, type WeaponKind } from '../data/types'
import { cappedBaseRanges, computeElement, ELEMENT_BUFFS, elementCap, type ElementCalcInput } from './elementCalc'

const db = loadTestDb()

describe('elementCap', () => {
  it('기본 + 400 과 기본 × 2.3 중 큰 쪽', () => {
    expect(elementCap(250)).toMatchObject({ value: 650, rule: 'add' })
    expect(elementCap(300)).toMatchObject({ value: 700, rule: 'add', mul: 690 })
    expect(elementCap(400)).toMatchObject({ value: 920, rule: 'mul', add: 800 })
    // 400 / 1.3 = 307.7 에서 식이 바뀐다
    expect(elementCap(307)).toMatchObject({ value: 707, rule: 'add' })
    expect(elementCap(308)).toMatchObject({ value: 708.4, rule: 'mul', add: 708 })
    // ×2.3 쪽은 버리지 않는다. 100 × 2.3 이 229.99999… 로 계산돼도 230
    expect(elementCap(455).value).toBe(1046.5)
    expect(elementCap(100).mul).toBe(230)
  })
})

describe('computeElement', () => {
  it('스킬이 없으면 기본 속성치 그대로', () => {
    const r = computeElement({ element: 'fire', kind: 'great-sword', base: 300, levels: {} })
    expect(r).toMatchObject({ raw: 300, value: 300, final: 300, capped: false, mul: 1, add: 0 })
    expect(r.applied).toEqual([])
  })

  it('속성 공격 강화: 게임 데이터의 효과 글 (Lv1 +40, Lv2 1.1배 +50, Lv3 1.2배 +60)', () => {
    const at = (level: number) =>
      computeElement({ element: 'water', kind: 'long-sword', base: 300, levels: { elementAttack: level } }).value
    expect(at(1)).toBe(340)
    expect(at(2)).toBe(380)
    expect(at(3)).toBe(420)
  })

  it('게임 화면 예: 배율은 서로 곱하고 가산은 곱한 뒤 더하며 반올림한다', () => {
    // 거극 아티어 슬래시액스 불 480: 불속성 공격 강화 3 → 636, 전화위복 3 (×1.3) 을 더하면 809 (808.8)
    // (Yahoo!知恵袋 2026-01-27. 배율을 더하면 780, 가산에도 곱하면 826)
    const sa = { element: 'fire' as const, kind: 'switch-axe' as const, base: 480 }
    expect(computeElement({ ...sa, levels: { elementAttack: 3 } }).final).toBe(636)
    const both = computeElement({ ...sa, levels: { elementAttack: 3, coalescence: 3 } })
    expect(both).toMatchObject({ mul: 1.56, add: 60, raw: 808.8, final: 809, capped: false })
    // 태도 디멘시오 물 400 (아티어 3부위 +30, 속성 강화 +50 ×2 포함) + 물속성 공격 강화 3 → 540 (kuroyonhon memo 21)
    expect(computeElement({ element: 'water', kind: 'long-sword', base: 400, levels: { elementAttack: 3 } }).final).toBe(540)
  })

  it('상한을 넘으면 상한에서 자른다', () => {
    const levels = { elementAttack: 3, coalescence: 3, absorption: 3, convertElement: 3 }
    const r = computeElement({ element: 'dragon', kind: 'great-sword', base: 250, levels })
    expect(r.raw).toBe(250 * 1.56 + 60 + 100 + 180)
    expect(r).toMatchObject({ capped: true, final: 650 })
    // ×2.3 상한이 소수면 그 값을 반올림해 보인다
    const high = computeElement({ element: 'dragon', kind: 'great-sword', base: 335, levels })
    expect(high.cap.value).toBe(770.5)
    expect(high).toMatchObject({ capped: true, final: 771 })
  })

  it('속성 변환은 용속성 무기에만', () => {
    const levels = { convertElement: 3 }
    expect(computeElement({ element: 'dragon', kind: 'hammer', base: 200, levels }).value).toBeGreaterThan(200)
    expect(computeElement({ element: 'fire', kind: 'hammer', base: 200, levels }).value).toBe(200)
  })

  it('반올림은 부동소수점 오차에 흔들리지 않는다 (.5 는 올림)', () => {
    // 290 × 1.1 = 318.99999… 로 계산돼도 319, 255 × 1.1 = 280.5 → 281
    for (let base = 1; base <= 1000; base++) {
      const r = computeElement({ element: 'ice', kind: 'bow', base, levels: { elementAttack: 2 } })
      expect(r.value).toBe(Math.floor((base * 110 + 5000 + 50) / 100))
    }
  })
})

describe('cappedBaseRanges', () => {
  it('구간 안은 상한에 걸리고 바깥은 걸리지 않는다', () => {
    const input = { element: 'dragon' as const, kind: 'great-sword' as const, levels: { elementAttack: 3, coalescence: 3, absorption: 3, convertElement: 3 } }
    const ranges = cappedBaseRanges(input, 2000)
    for (let base = 1; base <= 2000; base++) {
      const inside = ranges.some((r) => r.from <= base && base <= r.to)
      expect(computeElement({ ...input, base }).capped).toBe(inside)
    }
  })

  it('스킬이 없으면 걸리는 기본 속성치가 없다', () => {
    expect(cappedBaseRanges({ element: 'fire', kind: 'lance', levels: {} }, 2000)).toEqual([])
  })
})

describe('스킬별 효과 (게임 화면·검증 예)', () => {
  const at = (kind: WeaponKind, base: number, levels: ElementCalcInput['levels'], extra: Partial<ElementCalcInput> = {}) =>
    computeElement({ element: 'fire', kind, base, levels, ...extra })

  it('수렵피리 선율 속성 공격력 UP: 불 410 + 불속성 공격 강화 3 → ×1.08 591, 겹치면 ×1.1 601 (kuroyonhon memo 21)', () => {
    expect(at('hunting-horn', 410, { elementAttack: 3, hornMelody: 1 }).final).toBe(591)
    expect(at('hunting-horn', 410, { elementAttack: 3, hornMelody: 2 }).final).toBe(601)
  })

  it('선전호응Ⅱ: 200 + 불속성 공격 강화 3 → 200 × 1.2 × 1.3 + 60 + 40 = 412 (game8.jp 750224)', () => {
    expect(at('long-sword', 200, { elementAttack: 3, mutualHostility: 2 }).final).toBe(412)
  })

  it('내성 변환: 번개 250 + 번개속성 공격 강화 3 + 번개 내성 50 → 250 × 1.2 + 60 + 50 × 4 = 560', () => {
    const r = computeElement({
      element: 'thunder',
      kind: 'dual-blades',
      base: 250,
      levels: { elementAttack: 3, convertResistance: 1 },
      resistances: { thunder: 50 },
    })
    expect(r.final).toBe(560)
    // 대검·해머·수렵피리는 1 마다 +5, 0 보다 낮은 내성은 0 으로 본다
    const heavy = { element: 'thunder' as const, kind: 'hammer' as const, base: 400, levels: { convertResistance: 1 } }
    expect(computeElement({ ...heavy, resistances: { thunder: 20 } }).add).toBe(100)
    expect(computeElement({ ...heavy, resistances: { thunder: -5 } }).add).toBe(0)
    // 불·얼음·용속성에는 붙지 않는 스킬이다
    expect(computeElement({ ...heavy, element: 'fire', resistances: { thunder: 20 } }).add).toBe(0)
  })

  it('연격 5번 이어 맞힌 뒤: Lv5 대검·수렵피리 +200, 쌍검·활 +120, 나머지 +140', () => {
    expect(at('great-sword', 300, { burst: 5 }).add).toBe(200)
    expect(at('hunting-horn', 300, { burst: 5 }).add).toBe(200)
    expect(at('dual-blades', 300, { burst: 5 }).add).toBe(120)
    expect(at('bow', 300, { burst: 5 }).add).toBe(120)
    expect(at('hammer', 300, { burst: 5 }).add).toBe(140)
    expect(at('lance', 300, { burst: 1 }).add).toBe(60)
  })

  it('속성 흡수: 무기 종류별 값에 효과 중 또 맞은 단계마다 +10', () => {
    expect(at('great-sword', 300, { absorption: 3 }).add).toBe(100)
    expect(at('great-sword', 300, { absorption: 3 }, { stages: { absorption: 3 } }).add).toBe(120)
    expect(at('bow', 300, { absorption: 1 }, { stages: { absorption: 2 } }).add).toBe(40)
    expect(at('lance', 300, { absorption: 2 }, { stages: { absorption: 9 } }).add).toBe(70)
  })

  it('무기 종류에 따라 배율이 다른 스킬', () => {
    expect(at('great-sword', 300, { coalescence: 3 }).mul).toBe(1.3)
    expect(at('long-sword', 300, { coalescence: 3 }).mul).toBe(1.15)
    expect(at('hammer', 300, { darkArts: 1 }).mul).toBe(1.2)
    expect(at('insect-glaive', 300, { darkArts: 1 }).mul).toBe(1.14)
    expect(at('charge-blade', 300, { chargeMaster: 3 }).mul).toBe(1.25)
    expect(at('bow', 300, { chargeMaster: 3 }).mul).toBe(1.15)
    // 쌍검은 모으기 공격이 없다
    expect(at('dual-blades', 300, { chargeMaster: 3 }).mul).toBe(1)
  })
})

describe('ELEMENT_BUFFS', () => {
  it('스킬 버프는 데이터에 스킬이 있고 레벨이 데이터 안이며, 스킬이 아닌 버프는 이름이 있다', () => {
    for (const buff of ELEMENT_BUFFS) {
      if (!buff.skillGameId) {
        expect(buff.name, buff.id).toBeTruthy()
        expect(buff.levelNames, buff.id).toHaveLength(buff.maxLevel)
        continue
      }
      for (const element of ELEMENTS) {
        const skill = db.skillByGameId(buff.skillGameId(element))
        expect(skill, `${buff.id} ${element}`).toBeDefined()
        // 암흑기사의 증표는 2부위(어둠의 기교)만 속성치를 올려서 1단계까지만 고른다
        expect(buff.maxLevel, `${buff.id} ${element}`).toBeLessThanOrEqual(skill!.maxLevel)
        if (buff.id !== 'darkArts') expect(buff.maxLevel, `${buff.id} ${element}`).toBe(skill!.maxLevel)
      }
    }
  })

  it('모든 레벨·무기 종류에서 효과가 숫자다', () => {
    for (const buff of ELEMENT_BUFFS) {
      for (const kind of WEAPON_KINDS) {
        for (let level = 1; level <= buff.maxLevel; level++) {
          const e = buff.effect(level, kind, { resistance: 30, stage: buff.maxStage ?? 1 })
          expect(Number.isFinite(e.mul ?? 1) && Number.isFinite(e.add ?? 0), `${buff.id} ${kind} ${level}`).toBe(true)
          expect((e.mul ?? 1) >= 1 && (e.add ?? 0) >= 0, `${buff.id} ${kind} ${level}`).toBe(true)
        }
      }
    }
  })
})
