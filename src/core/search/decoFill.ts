// 장식주 채우기: 요구 스킬 부족분을 장식주로 메울 수 있는지 정확히 판정하고, 남는 슬롯 점수가 가장 큰 배치를 찾는다.
import type { Decoration, SlotLevel } from '../../data/types'
import type { EquipKey, Slot, SlotKind } from '../types'

/** 레벨별 슬롯 개수 [Lv1, Lv2, Lv3] */
export type SlotCounts = [number, number, number]

/** 장식주 크기별 개수 [크기1, 크기2, 크기3] */
export type SizeCounts = [number, number, number]

/**
 * 장식주 여유분 (DESIGN.md §6.8): 다 채우고 남는 슬롯에 종류별로 이 크기의 장식주를 하나씩 더 끼울 수 있어야 한다.
 * 채우기는 맡은 종류의 슬롯만 받으므로(방어구 채우기의 무기 슬롯은 [0,0,0]) 맡지 않는 종류는 [0,0,0] 으로 둔다
 */
export interface SpareSizes {
  armor: SizeCounts
  weapon: SizeCounts
}

export const NO_SPARE: Readonly<SpareSizes> = { armor: [0, 0, 0], weapon: [0, 0, 0] }

/**
 * 크기별 장식주 n 이 레벨별 슬롯 a 에 다 들어가는지.
 * 레벨이 포함 관계라 '크기 k 이상 장식주 수 ≤ 레벨 k 이상 슬롯 수' (k = 3, 2, 1) 이면 들어간다
 */
export function fitsSizes(a: Readonly<SlotCounts>, n: Readonly<SizeCounts>): boolean {
  return n[2] <= a[2] && n[1] + n[2] <= a[1] + a[2] && n[0] + n[1] + n[2] <= a[0] + a[1] + a[2]
}

const addSizes = (a: Readonly<SizeCounts>, b: Readonly<SizeCounts>): SizeCounts => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

const isZero = (n: Readonly<SizeCounts>) => n[0] === 0 && n[1] === 0 && n[2] === 0

export interface FillDeco {
  decoration: Decoration
  kind: SlotKind
  size: SlotLevel
  /** 채우기 대상 스킬(로컬 인덱스)별 점수 */
  pts: number[]
  /** 이 장식주가 주는 스킬 레벨 합 (채우기 대상이 아닌 스킬, pts 에서 잘린 레벨 포함) */
  levels: number
  /** 스킬이 둘 이상인 복합 장식주 */
  combo: boolean
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
  /** 넘치는 레벨: 장식주가 주는 스킬 레벨 중 부족분을 채우지 않는 것 (요구를 넘는 레벨, 채우기 대상이 아닌 스킬) */
  waste: number
  /** 사용한 복합 장식주 수 */
  combos: number
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
 * 같은 종류에서 크기가 작거나 같고, 모든 요구 스킬 점수가 크거나 같고, 스킬 레벨 합이 작거나 같고, 비선호 스킬이 부분집합이고,
 * 복합 장식주가 아니거나 둘 다 복합 장식주인 장식주가 있으면 그 장식주로 바꿔도 손해가 없으므로 후보에서 뺀다.
 * 레벨 합·복합 여부도 보는 건 넘치는 레벨·복합 장식주(FillResult.waste·combos)가 늘지 않게: 집중-파룡주(집중3·용속성1)는 용속성을
 * 원해도 집중주Ⅲ 을 빼지 않고, 원하는 스킬이 아닌 탄도 강화가 붙은 뇌광-사법주는 같은 점수의 뇌광주Ⅲ 이 뺀다
 */
export function removeDominated(decos: readonly FillDeco[]): FillDeco[] {
  const kept: FillDeco[] = []
  decos.forEach((d, i) => {
    const dominated = decos.some((o, j) => {
      if (i === j || o.kind !== d.kind || o.size > d.size || o.levels > d.levels || (o.combo && !d.combo)) return false
      if (!o.pts.every((p, k) => p >= d.pts[k])) return false
      if (!isSubset(o.unwanted, d.unwanted)) return false
      const identical =
        o.size === d.size &&
        o.levels === d.levels &&
        o.combo === d.combo &&
        o.unwanted.length === d.unwanted.length &&
        o.pts.every((p, k) => p === d.pts[k])
      // 완전히 같으면 앞쪽 하나만 남긴다
      return !identical || j < i
    })
    if (!dominated) kept.push(d)
  })
  return kept
}

/**
 * 메모이제이션 장식주 채우기. 상태 = (스킬별 부족분, 방어구 슬롯 개수, 무기 슬롯 개수).
 * 장식주는 들어갈 수 있는 가장 작은 슬롯에 넣는다 (슬롯 레벨이 포함 관계라 교환 논법상 항상 최적: 남는 슬롯의 레벨 k 이상 개수가
 * k 마다 가장 많아서, 장식주 여유분도 이 배치에서 안 들어가면 어떤 배치에서도 안 들어간다).
 */
export class DecoFiller {
  private readonly memo = new Map<string, FillResult | null>()
  /** 스킬(로컬 인덱스) → 그 스킬을 주는 장식주 */
  private readonly bySkill: FillDeco[][]
  /** 슬롯 레벨별로 넣을 수 있는 장식주가 주는 점수 합 최댓값 (가지치기용 상한) */
  private readonly potential: Record<SlotKind, [number, number, number]>
  /** 스킬(로컬 인덱스)별 고정 여부: 허용치가 있어도 모자란 채로 두지 않는다 */
  private readonly locked: readonly boolean[]
  /** 다 채우고 남는 슬롯에 들어가야 하는 장식주 여유분 */
  private readonly spare: Readonly<SpareSizes>
  private readonly hasSpare: boolean
  /** 여유분이 차지하는 슬롯의 잠재력 하한: 크기 s 장식주는 레벨 s 이상 슬롯을 쓰고, 잠재력은 레벨이 높을수록 크거나 같다 */
  private readonly sparePotential: number

  constructor(
    decos: readonly FillDeco[],
    skillCount: number,
    locked: readonly boolean[] = [],
    spare: Readonly<SpareSizes> = NO_SPARE,
  ) {
    this.locked = locked
    this.spare = spare
    this.hasSpare = !isZero(spare.armor) || !isZero(spare.weapon)
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
    let sparePotential = 0
    for (const kind of ['armor', 'weapon'] as const) {
      for (let size = 0; size < 3; size++) sparePotential += spare[kind][size] * this.potential[kind][size]
    }
    this.sparePotential = sparePotential
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

  /**
   * 스킬마다 쓸 수 있는 장식주가 그 스킬 1레벨짜리 하나뿐이면 스킬별 장식주 (SimpleFill 을 쓸 수 있다), 아니면 null.
   * 지금 데이터의 방어구 장식주는 모두 이렇다
   */
  simpleDecos(): FillDeco[] | null {
    const decos: FillDeco[] = []
    for (let i = 0; i < this.bySkill.length; i++) {
      const list = this.bySkill[i]
      if (list.length !== 1) return null
      const deco = list[0]
      if (deco.unwanted.length > 0 || !deco.pts.every((p, k) => p === (k === i ? 1 : 0))) return null
      decos.push(deco)
    }
    return decos
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
    if (first < 0) {
      if (this.hasSpare && !(fitsSizes(a, this.spare.armor) && fitsSizes(w, this.spare.weapon))) return null
      return { score: slotScore(a) + slotScore(w), decos: [], unwanted: [], short: 0, waste: 0, combos: 0 }
    }

    const pa = this.potential.armor
    const pw = this.potential.weapon
    const capacity =
      a[0] * pa[0] + a[1] * pa[1] + a[2] * pa[2] + w[0] * pw[0] + w[1] * pw[1] + w[2] * pw[2] - this.sparePotential
    if (total - capacity > tolerance) return null

    let best: FillResult | null = null
    for (const deco of this.bySkill[first]) {
      const slots = deco.kind === 'armor' ? a : w
      let level = deco.size - 1
      while (level < 3 && slots[level] === 0) level++
      if (level >= 3) continue
      const next = d.slice()
      let waste = deco.levels
      for (let i = 0; i < next.length; i++) {
        if (deco.pts[i] === 0) continue
        next[i] = Math.max(0, next[i] - deco.pts[i])
        waste -= d[i] - next[i]
      }
      slots[level]--
      const sub = this.solve(next, a, w, tolerance)
      slots[level]++
      if (!sub) continue
      const unwanted = mergeSorted(deco.unwanted, sub.unwanted)
      waste += sub.waste
      const combos = sub.combos + (deco.combo ? 1 : 0)
      if (isBetter(sub.short, unwanted, sub.score, waste, combos, best)) {
        best = { score: sub.score, decos: [deco, ...sub.decos], unwanted, short: sub.short, waste, combos }
      }
    }
    // 이 스킬을 1레벨 모자란 채로 둔다 (고정한 스킬은 빼고)
    if (tolerance > 0 && !this.locked[first]) {
      const next = d.slice()
      next[first]--
      const sub = this.solve(next, a, w, tolerance - 1)
      if (sub && isBetter(sub.short + 1, sub.unwanted, sub.score, sub.waste, sub.combos, best)) {
        best = { ...sub, short: sub.short + 1 }
      }
    }
    return best
  }
}

/**
 * 스킬마다 그 스킬 1레벨 장식주가 하나뿐일 때의 채우기 (DecoFiller.simpleDecos, 허용치 0).
 * 넣을 장식주가 부족분으로 정해지므로 고를 것이 없다: 레벨이 포함 관계라 '크기 k 이상 장식주 수 ≤ 레벨 k 이상 슬롯 수'
 * (k = 3, 2, 1) 이면 다 들어가고, 큰 것부터 들어가는 가장 작은 슬롯에 넣으면 남는 슬롯 점수가 가장 크다 (DecoFiller 와 같은 결과).
 * 장식주 여유분(spare)은 넣을 장식주에 더해 같은 식으로 본다: 그 배치의 남는 슬롯이 레벨 k 이상 개수가 k 마다 가장 많아서
 * 넣을 장식주 + 여유분이 다 들어가면 남는 슬롯에 여유분이 들어간다
 */
export class SimpleFill {
  /** 스킬(로컬 인덱스)별 장식주 */
  readonly decos: readonly FillDeco[]
  /** 방어구 장식주 여유분 */
  readonly spare: Readonly<SizeCounts>

  constructor(decos: readonly FillDeco[], spare: Readonly<SizeCounts> = [0, 0, 0]) {
    this.decos = decos
    this.spare = spare
  }

  /** 넣을 장식주의 크기별 개수 */
  sizes(deficits: readonly number[]): SizeCounts {
    const n: SizeCounts = [0, 0, 0]
    for (let i = 0; i < deficits.length; i++) n[this.decos[i].size - 1] += deficits[i]
    return n
  }

  /** 넣을 장식주 n 에 여유분을 더한 크기별 개수: 이것이 다 들어가는 슬롯이어야 결과가 된다 */
  withSpare(n: Readonly<SizeCounts>): SizeCounts {
    return addSizes(n, this.spare)
  }

  /** 다 넣고 남는 슬롯 (다 들어갈 때만) */
  static free(a: Readonly<SlotCounts>, n: Readonly<SizeCounts>): SlotCounts {
    let r3 = a[2] - n[2]
    const take2 = Math.min(n[1], a[1])
    let r2 = a[1] - take2
    r3 -= n[1] - take2
    const take1 = Math.min(n[0], a[0])
    const r1 = a[0] - take1
    let over1 = n[0] - take1
    const up2 = Math.min(over1, r2)
    r2 -= up2
    over1 -= up2
    r3 -= over1
    return [r1, r2, r3]
  }

  /** DecoFiller.fill(deficits, a, [0,0,0], 0) 과 같은 결과 (DecoFiller 의 방어구 여유분 = spare) */
  fill(deficits: readonly number[], a: Readonly<SlotCounts>): FillResult | null {
    const n = this.sizes(deficits)
    if (!fitsSizes(a, this.withSpare(n))) return null
    const decos: FillDeco[] = []
    let waste = 0
    let combos = 0
    for (let i = 0; i < deficits.length; i++) {
      for (let k = 0; k < deficits[i]; k++) decos.push(this.decos[i])
      waste += deficits[i] * (this.decos[i].levels - 1)
      if (this.decos[i].combo) combos += deficits[i]
    }
    return { score: slotScore(SimpleFill.free(a, n)), decos, unwanted: [], short: 0, waste, combos }
  }
}

/**
 * 덜 모자란 배치 → 비선호 스킬이 적은 배치 → 남는 슬롯 점수가 큰 배치 → 넘치는 레벨이 적은 배치 → 복합 장식주가 적은 배치 순
 * (비선호 기준은 근사). 남는 슬롯이 같으면 원하는 스킬을 넘치게 하거나 다른 스킬이 붙는 복합 장식주보다 딱 맞는 장식주,
 * 그것도 같으면 단일 스킬 장식주 (집중3·고속 변형3·용속성3 은 파룡-집중주 + 집중주Ⅱ 대신 집중주Ⅲ + 파룡주Ⅲ)
 */
function isBetter(
  short: number,
  unwanted: readonly number[],
  score: number,
  waste: number,
  combos: number,
  best: FillResult | null,
): boolean {
  if (!best) return true
  if (short !== best.short) return short < best.short
  if (unwanted.length !== best.unwanted.length) return unwanted.length < best.unwanted.length
  if (score !== best.score) return score > best.score
  if (waste !== best.waste) return waste < best.waste
  return combos < best.combos
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
