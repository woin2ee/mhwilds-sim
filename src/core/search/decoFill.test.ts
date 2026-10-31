import { describe, expect, it } from 'vitest'
import type { Decoration, SlotLevel } from '../../data/types'
import type { SlotKind } from '../types'
import {
  assignDecorations,
  DecoFiller,
  fitsSizes,
  NO_SPARE,
  removeDominated,
  SimpleFill,
  type ConcreteSlot,
  type FillDeco,
  type SizeCounts,
  type SlotCounts,
  type SpareSizes,
} from './decoFill'

let nextId = 1
/**
 * levels = 장식주의 스킬 레벨 합 (기본은 점수 합: 채우기 대상이 아닌 스킬이 없다),
 * combo = 복합 장식주 (기본은 점수가 있는 스킬 + 채우기 대상이 아닌 스킬이 둘 이상)
 */
function deco(
  kind: SlotKind,
  size: SlotLevel,
  pts: number[],
  unwanted: number[] = [],
  levels = pts.reduce((s, p) => s + p, 0),
  combo = pts.filter((p) => p > 0).length + (levels > pts.reduce((s, p) => s + p, 0) ? 1 : 0) > 1,
): FillDeco {
  const decoration: Decoration = {
    id: nextId,
    gameId: nextId++,
    name: { ko: '', en: '', ja: '' },
    kind,
    size,
    rarity: 1,
    skills: [],
  }
  return { decoration, kind, size, pts, levels, combo, unwanted }
}

describe('DecoFiller', () => {
  it('들어갈 수 있는 가장 작은 슬롯에 넣는다', () => {
    const filler = new DecoFiller([deco('armor', 1, [1])], 1)
    // Lv1 하나 + Lv3 하나 → Lv1 에 넣고 Lv3 이 남는다
    expect(filler.fill([1], [1, 0, 1], [0, 0, 0])?.score).toBe(9)
  })

  it('남는 슬롯이 가장 많은 배치를 고른다', () => {
    // 스킬 2개를 Lv1 장식주 2개로 채우면 Lv3 슬롯이 남고, 복합 Lv3 장식주를 쓰면 Lv1 2개가 남는다
    const filler = new DecoFiller(
      [deco('armor', 1, [1, 0]), deco('armor', 1, [0, 1]), deco('armor', 3, [1, 1])],
      2,
    )
    const result = filler.fill([1, 1], [2, 0, 1], [0, 0, 0])
    expect(result?.score).toBe(9)
    expect(result?.decos.map((d) => d.size)).toEqual([1, 1])
  })

  it('슬롯이 모자라면 null', () => {
    const filler = new DecoFiller([deco('armor', 1, [1])], 1)
    expect(filler.fill([3], [1, 0, 0], [0, 0, 0])).toBeNull()
  })

  it('무기 장식주는 방어구 슬롯에 들어가지 않는다', () => {
    const filler = new DecoFiller([deco('weapon', 1, [1])], 1)
    expect(filler.fill([1], [0, 0, 3], [0, 0, 0])).toBeNull()
    expect(filler.fill([1], [0, 0, 0], [1, 0, 0])?.score).toBe(0)
  })

  it('부족분이 없으면 모든 슬롯이 남는다', () => {
    const filler = new DecoFiller([], 0)
    expect(filler.fill([], [1, 1, 1], [0, 0, 1])?.score).toBe(1 + 4 + 9 + 9)
  })

  it('허용치까지는 부족분을 남기고, 가장 적게 남기는 배치를 고른다', () => {
    const filler = new DecoFiller([deco('armor', 1, [1, 0]), deco('armor', 2, [0, 1])], 2)
    // Lv2 슬롯 하나뿐: 둘 중 하나만 채울 수 있다
    expect(filler.fill([1, 1], [0, 1, 0], [0, 0, 0])).toBeNull()
    const one = filler.fill([1, 1], [0, 1, 0], [0, 0, 0], 1)
    expect(one?.short).toBe(1)
    expect(one?.decos).toHaveLength(1)
    // 다 채울 수 있으면 허용치가 있어도 다 채운다
    expect(filler.fill([1, 1], [1, 1, 0], [0, 0, 0], 2)).toMatchObject({ short: 0, score: 0 })
    // 허용치보다 많이 모자라면 null
    expect(filler.fill([3, 3], [0, 1, 0], [0, 0, 0], 4)).toBeNull()
    expect(filler.fill([3, 3], [0, 1, 0], [0, 0, 0], 5)?.short).toBe(5)
  })

  it('고정한 스킬은 허용치가 있어도 모자란 채로 두지 않는다', () => {
    const filler = new DecoFiller([deco('armor', 1, [1, 0]), deco('armor', 2, [0, 1])], 2, [true, false])
    // Lv2 슬롯 하나: 고정한 0번 스킬을 채우고 1번 스킬이 모자란다
    const result = filler.fill([1, 1], [0, 1, 0], [0, 0, 0], 1)
    expect(result?.short).toBe(1)
    expect(result?.decos.map((d) => d.pts)).toEqual([[1, 0]])
    // 고정한 스킬을 다 채울 슬롯이 없으면 허용치가 커도 null
    expect(filler.fill([2, 0], [0, 1, 0], [0, 0, 0], 5)).toBeNull()
  })

  it('허용치가 있을 때 모든 배치를 넣어 본 결과와 같다 (무작위, 고정한 스킬·장식주 여유분·넘치는 레벨·복합 장식주 포함)', () => {
    // mulberry32: 실패하면 같은 사례로 다시 볼 수 있게 고정 시드
    let seed = 20261024
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const int = (max: number) => Math.floor(random() * (max + 1))
    for (let round = 0; round < 300; round++) {
      const skills = 1 + int(2)
      const decos = Array.from({ length: 1 + int(4) }, () => {
        const pts = Array.from({ length: skills }, () => int(2))
        if (!pts.some((p) => p > 0)) pts[int(skills - 1)] = 1
        // 채우기 대상이 아닌 스킬 레벨 (복합 장식주의 다른 스킬)
        const levels = pts.reduce((s, p) => s + p, 0) + int(1)
        return deco(random() < 0.7 ? 'armor' : 'weapon', (1 + int(2)) as SlotLevel, pts, [], levels)
      })
      const armor: [number, number, number] = [int(2), int(1), int(1)]
      const weapon: [number, number, number] = [int(1), 0, int(1)]
      const deficits = Array.from({ length: skills }, () => int(4))
      const tolerance = int(3)
      const locked = Array.from({ length: skills }, () => random() < 0.3)
      // 장식주 여유분 (절반은 없이)
      const spare: SpareSizes = random() < 0.5 ? NO_SPARE : { armor: [int(1), int(1), int(1)], weapon: [int(1), 0, int(1)] }

      // 슬롯마다 비우거나 들어가는 장식주 하나를 넣는 모든 경우
      const slots = (['armor', 'weapon'] as const).flatMap((kind) =>
        (kind === 'armor' ? armor : weapon).flatMap((n, i) => Array.from({ length: n }, () => ({ kind, level: i + 1 }))),
      )
      type Outcome = { short: number; score: number; waste: number; combos: number }
      /** 덜 모자란 → 남는 슬롯 점수가 큰 → 넘치는 레벨이 적은 → 복합 장식주가 적은 순 (비선호 장식주는 없다) */
      const better = (x: Outcome, y: Outcome) =>
        x.short !== y.short
          ? x.short < y.short
          : x.score !== y.score
            ? x.score > y.score
            : x.waste !== y.waste
              ? x.waste < y.waste
              : x.combos < y.combos
      let best: Outcome | null = null
      /** 비워 둔 슬롯의 종류별 레벨별 개수 */
      const free: Record<SlotKind, SlotCounts> = { armor: [0, 0, 0], weapon: [0, 0, 0] }
      const visit = (i: number, covered: number[], score: number, levels: number, combos: number) => {
        if (i === slots.length) {
          if (deficits.some((d, k) => locked[k] && covered[k] < d)) return
          if (!fitsSizes(free.armor, spare.armor) || !fitsSizes(free.weapon, spare.weapon)) return
          const short = deficits.reduce((s, d, k) => s + Math.max(0, d - covered[k]), 0)
          // 넘치는 레벨 = 넣은 장식주의 레벨 합 − 부족분을 채운 레벨
          const waste = levels - deficits.reduce((s, d, k) => s + Math.min(d, covered[k]), 0)
          const outcome = { short, score, waste, combos }
          if (!best || better(outcome, best)) best = outcome
          return
        }
        const slot = slots[i]
        free[slot.kind][slot.level - 1]++
        visit(i + 1, covered, score + slot.level * slot.level, levels, combos)
        free[slot.kind][slot.level - 1]--
        for (const d of decos) {
          if (d.kind === slot.kind && d.size <= slot.level) {
            visit(i + 1, covered.map((c, k) => c + d.pts[k]), score, levels + d.levels, combos + (d.combo ? 1 : 0))
          }
        }
      }
      visit(0, deficits.map(() => 0), 0, 0, 0)
      const expected = best as Outcome | null

      const result = new DecoFiller(decos, skills, locked, spare).fill(deficits, armor, weapon, tolerance)
      const label = JSON.stringify({
        round,
        decos: decos.map((d) => [d.kind, d.size, d.pts, d.levels]),
        armor,
        weapon,
        deficits,
        tolerance,
        locked,
        spare,
      })
      if (!expected || expected.short > tolerance) {
        expect(result, label).toBeNull()
        continue
      }
      const outcome = result && { short: result.short, score: result.score, waste: result.waste, combos: result.combos }
      expect(outcome, label).toEqual(expected)
      // 고른 장식주로 실제로 그만큼만 모자라고 그만큼만 넘치는지
      const covered = deficits.map((_, k) => result!.decos.reduce((s, d) => s + d.pts[k], 0))
      expect(deficits.reduce((s, d, k) => s + Math.max(0, d - covered[k]), 0), label).toBe(result!.short)
      expect(deficits.every((d, k) => !locked[k] || covered[k] >= d), label).toBe(true)
      const levels = result!.decos.reduce((s, d) => s + d.levels, 0)
      expect(levels - deficits.reduce((s, d, k) => s + Math.min(d, covered[k]), 0), label).toBe(result!.waste)
      expect(result!.decos.filter((d) => d.combo).length, label).toBe(result!.combos)
    }
  })

  it('장식주 여유분이 남는 배치를 고른다', () => {
    // 무기 슬롯 [3,1,1]: Lv1 장식주 둘이면 Lv3 이 남고(9), 두 스킬을 함께 주는 Lv3 장식주면 Lv1 둘이 남는다(2)
    const decos = [deco('weapon', 1, [1, 0]), deco('weapon', 1, [0, 1]), deco('weapon', 3, [1, 1])]
    const weapon: SlotCounts = [2, 0, 1]
    expect(new DecoFiller(decos, 2).fill([1, 1], [0, 0, 0], weapon)?.score).toBe(9)
    const keepTwo = new DecoFiller(decos, 2, [], { armor: [0, 0, 0], weapon: [2, 0, 0] })
    expect(keepTwo.fill([1, 1], [0, 0, 0], weapon)).toMatchObject({ score: 2, decos: [decos[2]] })
    // 다 남기고 부족분을 채울 수 없으면 null, 부족분이 없어도 여유분이 안 들어가면 null
    expect(new DecoFiller(decos, 2, [], { armor: [0, 0, 0], weapon: [2, 0, 1] }).fill([1, 1], [0, 0, 0], weapon)).toBeNull()
    expect(new DecoFiller([], 0, [], { armor: [0, 0, 1], weapon: [0, 0, 0] }).fill([], [3, 3, 0], [0, 0, 0])).toBeNull()
    // 크기 1 여유분은 더 큰 슬롯에 남아도 된다
    expect(new DecoFiller([], 0, [], { armor: [2, 0, 0], weapon: [0, 0, 0] }).fill([], [0, 1, 1], [0, 0, 0])?.score).toBe(13)
  })

  it('남는 슬롯 점수가 같으면 넘치는 레벨이 적은 배치를 고른다', () => {
    // 무기 [3,3,3] 에 집중3·고속 변형3·용속성1: 집중-파룡주와 속변-파룡주를 함께 끼면 용속성이 1 넘친다
    const focusDragon = deco('weapon', 3, [3, 0, 1])
    const quickDragon = deco('weapon', 3, [0, 3, 1])
    const focus = deco('weapon', 3, [3, 0, 0])
    const quick = deco('weapon', 3, [0, 3, 0])
    const dragon = deco('weapon', 1, [0, 0, 1])
    const filler = new DecoFiller([focusDragon, quickDragon, focus, quick, dragon], 3)
    const result = filler.fill([3, 3, 1], [0, 0, 0], [0, 0, 3])
    expect(result).toMatchObject({ score: 9, waste: 0 })
    expect(result!.decos.filter((d) => d === focusDragon || d === quickDragon)).toHaveLength(1)
    // 용속성을 이미 채웠으면 복합 장식주를 쓰지 않는다
    expect(filler.fill([3, 3, 0], [0, 0, 0], [0, 0, 3])).toMatchObject({ score: 9, waste: 0, decos: [focus, quick] })
    // 슬롯이 더 남으면 넘쳐도 복합 장식주 (남는 슬롯이 먼저)
    expect(filler.fill([1, 0, 1], [0, 0, 0], [0, 0, 2])).toMatchObject({ score: 9, waste: 2, decos: [focusDragon] })
  })

  it('넘치는 레벨도 같으면 복합 장식주가 적은 배치를 고른다', () => {
    // 무기 [3,3,3] 에 집중3·고속 변형3·용속성3: 파룡-집중주(용속성3·집중1) + 집중주Ⅱ 대신 집중주Ⅲ + 파룡주Ⅲ
    const focus2 = deco('weapon', 2, [2, 0, 0])
    const focus3 = deco('weapon', 3, [3, 0, 0])
    const dragonFocus = deco('weapon', 3, [1, 0, 3])
    const quick3 = deco('weapon', 3, [0, 3, 0])
    const dragon3 = deco('weapon', 3, [0, 0, 3])
    const filler = new DecoFiller([focus2, dragonFocus, focus3, quick3, dragon3], 3)
    expect(filler.fill([3, 3, 3], [0, 0, 0], [0, 0, 3])).toMatchObject({
      score: 0,
      waste: 0,
      combos: 0,
      decos: [focus3, quick3, dragon3],
    })
  })

  it('비선호 장식주는 다른 방법이 없을 때만 쓴다', () => {
    const clean = deco('armor', 3, [1])
    const dirty = deco('armor', 1, [1], [99])
    const filler = new DecoFiller([clean, dirty], 1)
    expect(filler.fill([1], [1, 0, 1], [0, 0, 0])?.unwanted).toEqual([])
    expect(filler.fill([1], [1, 0, 0], [0, 0, 0])?.unwanted).toEqual([99])
  })
})

describe('SimpleFill', () => {
  it('스킬마다 1레벨 장식주가 하나뿐일 때만 쓴다', () => {
    expect(new DecoFiller([deco('armor', 1, [1, 0]), deco('armor', 2, [0, 1])], 2).simpleDecos()).not.toBeNull()
    // 2레벨 장식주, 두 스킬 장식주, 한 스킬에 장식주 둘(지배되지 않음), 장식주 없는 스킬
    expect(new DecoFiller([deco('armor', 3, [2])], 1).simpleDecos()).toBeNull()
    expect(new DecoFiller([deco('armor', 3, [1, 1])], 2).simpleDecos()).toBeNull()
    expect(new DecoFiller([deco('armor', 1, [1]), deco('armor', 3, [2])], 1).simpleDecos()).toBeNull()
    expect(new DecoFiller([deco('armor', 1, [1, 0])], 2).simpleDecos()).toBeNull()
  })

  it('DecoFiller 와 같은 결과 (무작위, 장식주 여유분 포함)', () => {
    let seed = 20261026
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const int = (max: number) => Math.floor(random() * (max + 1))
    for (let round = 0; round < 2000; round++) {
      const skills = 1 + int(4)
      const decos = Array.from({ length: skills }, (_, i) =>
        deco('armor', (1 + int(2)) as SlotLevel, Array.from({ length: skills }, (_, k) => (k === i ? 1 : 0))),
      )
      const spare: SizeCounts = random() < 0.5 ? [0, 0, 0] : [int(2), int(1), int(1)]
      const filler = new DecoFiller(decos, skills, [], { armor: spare, weapon: [0, 0, 0] })
      const simple = new SimpleFill(filler.simpleDecos()!, spare)
      const armor: [number, number, number] = [int(4), int(4), int(4)]
      const deficits = Array.from({ length: skills }, () => int(3))
      const label = JSON.stringify({ round, sizes: decos.map((d) => d.size), armor, deficits, spare })
      const expected = filler.fill(deficits, armor, [0, 0, 0])
      const result = simple.fill(deficits, armor)
      if (!expected) {
        expect(result, label).toBeNull()
        continue
      }
      const ids = (r: typeof result) => r!.decos.map((d) => d.decoration.id).sort((a, b) => a - b)
      expect(result?.score, label).toBe(expected.score)
      expect(result?.waste, label).toBe(expected.waste)
      expect(ids(result), label).toEqual(ids(expected))
    }
  })
})

describe('removeDominated', () => {
  it('작거나 같은 크기에 점수가 같거나 높은 장식주가 있으면 뺀다', () => {
    const small = deco('weapon', 1, [1, 0])
    const big = deco('weapon', 3, [1, 0])
    const combo = deco('weapon', 3, [1, 1])
    const other = deco('armor', 1, [1, 0])
    expect(removeDominated([small, big, combo, other])).toEqual([small, combo, other])
  })

  it('비선호 스킬이 있는 장식주는 깨끗한 장식주를 지배하지 못한다', () => {
    const dirty = deco('armor', 1, [2], [5])
    const clean = deco('armor', 2, [1])
    expect(removeDominated([dirty, clean])).toEqual([dirty, clean])
  })

  it('스킬 레벨 합이 큰 장식주는 지배하지 못한다', () => {
    // 뇌광-사법주(번개3·탄도 강화1)가 뇌광주Ⅲ 보다 앞에 있어도 번개만 원하면 점수가 같고 레벨 합이 커서 빠진다
    const boltPrecise = deco('weapon', 3, [3], [], 4)
    const bolt = deco('weapon', 3, [3])
    expect(removeDominated([boltPrecise, bolt])).toEqual([bolt])
    // 집중-파룡주(집중3·용속성1)는 용속성도 원하면 점수가 크지만 레벨 합도 커서 집중주Ⅲ 을 빼지 않는다
    const focusDragon = deco('weapon', 3, [3, 1])
    const focus = deco('weapon', 3, [3, 0])
    expect(removeDominated([focusDragon, focus])).toEqual([focusDragon, focus])
    // 집중1 만 원하면 집중주Ⅲ(점수는 요구 레벨 1로 잘림)은 지금처럼 집중주【1】 이 뺀다
    const small = deco('weapon', 1, [1])
    expect(removeDominated([deco('weapon', 3, [1], [], 3, false), small])).toEqual([small])
  })

  it('복합 장식주는 단일 스킬 장식주를 지배하지 못한다', () => {
    // 레벨 합·점수가 같아도 복합 장식주(2·1)로는 단일 장식주(3)를 빼지 않고, 반대로는 뺀다
    const combo = deco('weapon', 3, [2, 1])
    const single = deco('weapon', 3, [2, 1], [], 3, false)
    expect(removeDominated([combo, single])).toEqual([single])
  })
})

describe('assignDecorations', () => {
  it('큰 장식주부터 맞는 가장 작은 실제 슬롯에 배치한다', () => {
    const slots: ConcreteSlot[] = [
      { key: 'head', index: 0, slot: { kind: 'armor', level: 3 } },
      { key: 'head', index: 1, slot: { kind: 'armor', level: 1 } },
      { key: 'chest', index: 0, slot: { kind: 'armor', level: 2 } },
      { key: 'weapon', index: 0, slot: { kind: 'weapon', level: 3 } },
    ]
    const a1 = deco('armor', 1, [1])
    const a2 = deco('armor', 2, [1])
    const w1 = deco('weapon', 1, [1])
    const assigned = assignDecorations(slots, [a1, a2, w1])!
    expect(assigned.get(slots[2])).toBe(a2.decoration)
    expect(assigned.get(slots[1])).toBe(a1.decoration)
    expect(assigned.get(slots[3])).toBe(w1.decoration)
    expect(assigned.has(slots[0])).toBe(false)
    expect(assignDecorations(slots, [deco('armor', 3, [1]), deco('armor', 3, [1])])).toBeNull()
  })
})
