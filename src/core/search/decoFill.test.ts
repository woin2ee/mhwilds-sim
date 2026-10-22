import { describe, expect, it } from 'vitest'
import type { Decoration, SlotLevel } from '../../data/types'
import type { SlotKind } from '../types'
import { assignDecorations, DecoFiller, removeDominated, type ConcreteSlot, type FillDeco } from './decoFill'

let nextId = 1
function deco(kind: SlotKind, size: SlotLevel, pts: number[], unwanted: number[] = []): FillDeco {
  const decoration: Decoration = {
    id: nextId++,
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

  it('비선호 장식주는 다른 방법이 없을 때만 쓴다', () => {
    const clean = deco('armor', 3, [1])
    const dirty = deco('armor', 1, [1], [99])
    const filler = new DecoFiller([clean, dirty], 1)
    expect(filler.fill([1], [1, 0, 1], [0, 0, 0])?.unwanted).toEqual([])
    expect(filler.fill([1], [1, 0, 0], [0, 0, 0])?.unwanted).toEqual([99])
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
