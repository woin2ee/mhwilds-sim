// 장식주 채우기: 요구 스킬 부족분을 장식주로 메울 수 있는지 정확히 판정하고, 남는 슬롯 점수가 가장 큰 배치를 찾는다.
import type { Decoration, SlotLevel } from '../../data/types'
import type { EquipKey, Slot, SlotKind } from '../types'

/** 레벨별 슬롯 개수 [Lv1, Lv2, Lv3] */
export type SlotCounts = [number, number, number]

export interface FillDeco {
  decoration: Decoration
  kind: SlotKind
  size: SlotLevel
  /** 채우기 대상 스킬(로컬 인덱스)별 점수 */
  pts: number[]
  /** 이 장식주가 가진 비선호 스킬 id (정렬) */
  unwanted: number[]
}

export interface FillResult {
  /** 남는 슬롯 점수 Σ level² (방어구·무기 슬롯 모두) */
  score: number
  decos: FillDeco[]
  /** 사용한 장식주들의 비선호 스킬 합집합 (정렬) */
  unwanted: number[]
  /** 채우지 못하고 남긴 부족분 합 (fill 의 tolerance 이하, 부족분을 다 채우면 0) */
  short: number
}

export function slotScore(counts: Readonly<SlotCounts>): number {
  return counts[0] + counts[1] * 4 + counts[2] * 9
}

/** 레벨별 슬롯 점수 Σ level² */
export function slotListScore(slots: readonly { level: SlotLevel }[]): number {
  let score = 0
  for (const slot of slots) score += slot.level * slot.level
  return score
}

export function mergeSorted(a: readonly number[], b: readonly number[]): number[] {
  if (a.length === 0) return b as number[]
  if (b.length === 0) return a as number[]
  return [...new Set([...a, ...b])].sort((x, y) => x - y)
}

const isSubset = (a: readonly number[], b: readonly number[]) => a.every((x) => b.includes(x))

/**
 * 같은 종류에서 크기가 작거나 같고, 모든 요구 스킬 점수가 크거나 같고, 비선호 스킬이 부분집합인
 * 장식주가 있으면 그 장식주로 바꿔도 손해가 없으므로 후보에서 뺀다.
 */
export function removeDominated(decos: readonly FillDeco[]): FillDeco[] {
  const kept: FillDeco[] = []
  decos.forEach((d, i) => {
    const dominated = decos.some((o, j) => {
      if (i === j || o.kind !== d.kind || o.size > d.size) return false
      if (!o.pts.every((p, k) => p >= d.pts[k])) return false
      if (!isSubset(o.unwanted, d.unwanted)) return false
      const identical =
        o.size === d.size && o.unwanted.length === d.unwanted.length && o.pts.every((p, k) => p === d.pts[k])
      // 완전히 같으면 앞쪽 하나만 남긴다
      return !identical || j < i
    })
    if (!dominated) kept.push(d)
  })
  return kept
}

/**
 * 메모이제이션 장식주 채우기. 상태 = (스킬별 부족분, 방어구 슬롯 개수, 무기 슬롯 개수).
 * 장식주는 들어갈 수 있는 가장 작은 슬롯에 넣는다 (슬롯 레벨이 포함 관계라 교환 논법상 항상 최적).
 */
export class DecoFiller {
  private readonly memo = new Map<string, FillResult | null>()
  /** 스킬(로컬 인덱스) → 그 스킬을 주는 장식주 */
  private readonly bySkill: FillDeco[][]
  /** 슬롯 레벨별로 넣을 수 있는 장식주가 주는 점수 합 최댓값 (가지치기용 상한) */
  private readonly potential: Record<SlotKind, [number, number, number]>
  /** 스킬(로컬 인덱스)별 고정 여부: 허용치가 있어도 모자란 채로 두지 않는다 */
  private readonly locked: readonly boolean[]

  constructor(decos: readonly FillDeco[], skillCount: number, locked: readonly boolean[] = []) {
    this.locked = locked
    const usable = removeDominated(decos)
    this.bySkill = Array.from({ length: skillCount }, (_, i) =>
      usable
        .filter((d) => d.pts[i] > 0)
        .sort((a, b) => a.size - b.size || b.pts[i] - a.pts[i] || a.decoration.id - b.decoration.id),
    )
    this.potential = { armor: [0, 0, 0], weapon: [0, 0, 0] }
    for (const d of usable) {
      const total = d.pts.reduce((s, p) => s + p, 0)
      for (let level = d.size; level <= 3; level++) {
        const pot = this.potential[d.kind]
        pot[level - 1] = Math.max(pot[level - 1], total)
      }
    }
  }

  /**
   * 부족분을 채울 수 없으면 null. 인자 배열은 변경하지 않는다.
   * tolerance 를 주면 부족분을 그 합까지 남겨도 되고, 가장 적게 남기는 배치를 고른다 (모자란 조합 찾기, DESIGN.md §6.7).
   */
  fill(
    deficits: readonly number[],
    armor: Readonly<SlotCounts>,
    weapon: Readonly<SlotCounts>,
    tolerance = 0,
  ): FillResult | null {
    return this.solve([...deficits], [...armor], [...weapon], tolerance)
  }

  get memoSize(): number {
    return this.memo.size
  }

  private solve(d: number[], a: SlotCounts, w: SlotCounts, tolerance: number): FillResult | null {
    // 부족분 합보다 큰 허용치는 부족분 합과 같다 (메모 키를 줄인다)
    if (tolerance > 0) tolerance = Math.min(tolerance, d.reduce((s, x) => s + x, 0))
    const key = `${d.join(',')}|${a.join(',')}|${w.join(',')}${tolerance > 0 ? `|${tolerance}` : ''}`
    const cached = this.memo.get(key)
    if (cached !== undefined) return cached
    const result = this.compute(d, a, w, tolerance)
    this.memo.set(key, result)
    return result
  }

  private compute(d: number[], a: SlotCounts, w: SlotCounts, tolerance: number): FillResult | null {
    let first = -1
    let total = 0
    for (let i = 0; i < d.length; i++) {
      if (d[i] > 0) {
        if (first < 0) first = i
        total += d[i]
      }
    }
    if (first < 0) return { score: slotScore(a) + slotScore(w), decos: [], unwanted: [], short: 0 }

    const pa = this.potential.armor
    const pw = this.potential.weapon
    const capacity = a[0] * pa[0] + a[1] * pa[1] + a[2] * pa[2] + w[0] * pw[0] + w[1] * pw[1] + w[2] * pw[2]
    if (total - capacity > tolerance) return null

    let best: FillResult | null = null
    for (const deco of this.bySkill[first]) {
      const slots = deco.kind === 'armor' ? a : w
      let level = deco.size - 1
      while (level < 3 && slots[level] === 0) level++
      if (level >= 3) continue
      const next = d.slice()
      for (let i = 0; i < next.length; i++) if (deco.pts[i] > 0) next[i] = Math.max(0, next[i] - deco.pts[i])
      slots[level]--
      const sub = this.solve(next, a, w, tolerance)
      slots[level]++
      if (!sub) continue
      const unwanted = mergeSorted(deco.unwanted, sub.unwanted)
      if (isBetter(sub.short, unwanted, sub.score, best)) {
        best = { score: sub.score, decos: [deco, ...sub.decos], unwanted, short: sub.short }
      }
    }
    // 이 스킬을 1레벨 모자란 채로 둔다 (고정한 스킬은 빼고)
    if (tolerance > 0 && !this.locked[first]) {
      const next = d.slice()
      next[first]--
      const sub = this.solve(next, a, w, tolerance - 1)
      if (sub && isBetter(sub.short + 1, sub.unwanted, sub.score, best)) best = { ...sub, short: sub.short + 1 }
    }
    return best
  }
}

/** 덜 모자란 배치 → 비선호 스킬이 적은 배치 → 남는 슬롯 점수가 큰 배치 순 (비선호 기준은 근사) */
function isBetter(short: number, unwanted: readonly number[], score: number, best: FillResult | null): boolean {
  if (!best) return true
  if (short !== best.short) return short < best.short
  if (unwanted.length !== best.unwanted.length) return unwanted.length < best.unwanted.length
  return score > best.score
}

/** 실제 장비 슬롯 하나 */
export interface ConcreteSlot {
  key: EquipKey
  index: number
  slot: Slot
}

/**
 * 개수 기준으로 정한 장식주들을 실제 슬롯에 배치한다. 큰 장식주부터, 들어갈 수 있는 가장 작은 슬롯에 넣는다.
 * 배치에 실패하면 null (개수 기준 판정이 맞다면 일어나지 않음).
 */
export function assignDecorations(
  slots: readonly ConcreteSlot[],
  decos: readonly FillDeco[],
): Map<ConcreteSlot, Decoration> | null {
  const assigned = new Map<ConcreteSlot, Decoration>()
  const ordered = [...decos].sort((x, y) => y.size - x.size)
  for (const deco of ordered) {
    let target: ConcreteSlot | null = null
    for (const slot of slots) {
      if (assigned.has(slot) || slot.slot.kind !== deco.kind || slot.slot.level < deco.size) continue
      if (!target || slot.slot.level < target.slot.level) target = slot
    }
    if (!target) return null
    assigned.set(target, deco.decoration)
  }
  return assigned
}
