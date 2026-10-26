import { describe, expect, it } from 'vitest'
import type { Decoration, SlotLevel } from '../../data/types'
import type { SlotKind } from '../types'
import { assignDecorations, DecoFiller, removeDominated, SimpleFill, type ConcreteSlot, type FillDeco } from './decoFill'

let nextId = 1
function deco(kind: SlotKind, size: SlotLevel, pts: number[], unwanted: number[] = []): FillDeco {
  const decoration: Decoration = {
    id: nextId,
    gameId: nextId++,
    name: { ko: '', en: '', ja: '' },
    kind,
    size,
    rarity: 1,
    skills: [],
  }
  return { decoration, kind, size, pts, unwanted }
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

  it('허용치가 있을 때 모든 배치를 넣어 본 결과와 같다 (무작위, 고정한 스킬 포함)', () => {
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
        return deco(random() < 0.7 ? 'armor' : 'weapon', (1 + int(2)) as SlotLevel, pts)
      })
      const armor: [number, number, number] = [int(2), int(1), int(1)]
      const weapon: [number, number, number] = [int(1), 0, int(1)]
      const deficits = Array.from({ length: skills }, () => int(4))
      const tolerance = int(3)
      const locked = Array.from({ length: skills }, () => random() < 0.3)

      // 슬롯마다 비우거나 들어가는 장식주 하나를 넣는 모든 경우
      const slots = (['armor', 'weapon'] as const).flatMap((kind) =>
        (kind === 'armor' ? armor : weapon).flatMap((n, i) => Array.from({ length: n }, () => ({ kind, level: i + 1 }))),
      )
      let best: { short: number; score: number } | null = null
      const visit = (i: number, covered: number[], score: number) => {
        if (i === slots.length) {
          if (deficits.some((d, k) => locked[k] && covered[k] < d)) return
          const short = deficits.reduce((s, d, k) => s + Math.max(0, d - covered[k]), 0)
          if (!best || short < best.short || (short === best.short && score > best.score)) best = { short, score }
          return
        }
        const slot = slots[i]
        visit(i + 1, covered, score + slot.level * slot.level)
        for (const d of decos) {
          if (d.kind === slot.kind && d.size <= slot.level) visit(i + 1, covered.map((c, k) => c + d.pts[k]), score)
        }
      }
      visit(0, deficits.map(() => 0), 0)
      const expected = best as { short: number; score: number } | null

      const result = new DecoFiller(decos, skills, locked).fill(deficits, armor, weapon, tolerance)
      const label = JSON.stringify({ round, decos: decos.map((d) => [d.kind, d.size, d.pts]), armor, weapon, deficits, tolerance, locked })
      if (!expected || expected.short > tolerance) {
        expect(result, label).toBeNull()
        continue
      }
      expect(result && { short: result.short, score: result.score }, label).toEqual(expected)
      // 고른 장식주로 실제로 그만큼만 모자란지
      const covered = deficits.map((_, k) => result!.decos.reduce((s, d) => s + d.pts[k], 0))
      expect(deficits.reduce((s, d, k) => s + Math.max(0, d - covered[k]), 0), label).toBe(result!.short)
      expect(deficits.every((d, k) => !locked[k] || covered[k] >= d), label).toBe(true)
    }
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

  it('DecoFiller 와 같은 결과 (무작위)', () => {
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
      const filler = new DecoFiller(decos, skills)
      const simple = new SimpleFill(filler.simpleDecos()!)
      const armor: [number, number, number] = [int(4), int(4), int(4)]
      const deficits = Array.from({ length: skills }, () => int(3))
      const label = JSON.stringify({ round, sizes: decos.map((d) => d.size), armor, deficits })
      const expected = filler.fill(deficits, armor, [0, 0, 0])
      const result = simple.fill(deficits, armor)
      if (!expected) {
        expect(result, label).toBeNull()
        continue
      }
      const ids = (r: typeof result) => r!.decos.map((d) => d.decoration.id).sort((a, b) => a - b)
      expect(result?.score, label).toBe(expected.score)
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
