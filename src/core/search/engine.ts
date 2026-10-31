// 세팅 검색 엔진 (DESIGN.md §6). 순수 동기 함수 — Web Worker(search.worker.ts)와 테스트에서 그대로 실행한다.
import type { GameDb } from '../../data/db'
import { ARMOR_KINDS, type ArmorKind, type Decoration, type SlotLevel } from '../../data/types'
import { activeSkillLevels, bonusLevel, computeBuild, unwantedSkillsOf } from '../calc'
import { canTranscend } from '../transcend'
import { emptyBuild, EQUIP_KEYS } from '../types'
import {
  assignDecorations,
  fitsSizes,
  SimpleFill,
  slotScore,
  type ConcreteSlot,
  type FillDeco,
  type FillResult,
  type SizeCounts,
  type SlotCounts,
} from './decoFill'
import {
  bonusShortfall,
  prepare,
  type ArmorClass,
  type ArmorOption,
  type Fillers,
  type OptionGroup,
  type OptionSwap,
  type Prepared,
} from './prepare'
import { TopK, type Ranked } from './topK'
import type { SearchProgress, SearchRequest, SearchResponse, SearchResultItem } from './types'

export interface SearchLimits {
  /** 평가할 완성 조합(리프) 수 상한 */
  maxLeaves: number
  /** 탐색 시간 상한 (ms) */
  maxMillis: number
}

export const DEFAULT_LIMITS: SearchLimits = { maxLeaves: 2_000_000, maxMillis: 20_000 }
const DEFAULT_RESULT_LIMIT = 300
const PROGRESS_INTERVAL_MS = 100

export interface EngineHooks {
  onProgress?(progress: SearchProgress): void
  /** true 를 반환하면 탐색을 멈추고 지금까지 찾은 결과를 truncated=true 로 반환 */
  shouldStop?(): boolean
  /** 탐색 상한 조정 (기본값 DEFAULT_LIMITS) */
  limits?: Partial<SearchLimits>
}

export function runSearch(db: GameDb, request: SearchRequest, hooks: EngineHooks = {}): SearchResponse {
  const started = performance.now()
  const prepared = prepare(db, request)
  if (!prepared) return { items: [], total: 0, truncated: false, elapsedMs: performance.now() - started, shortfall: 0 }
  const searcher = new Searcher(db, request, prepared, hooks, started, 0)
  searcher.run()
  const response = searcher.response()
  // 조건을 모두 채우는 조합이 (끝까지 찾아도) 없으면 원하는 스킬이 가장 적게 모자란 조합을 찾는다 (§6.7).
  // 시간 상한은 앞의 검색과 함께 센다
  const maxShortfall = Math.floor(request.maxShortfall)
  // 원하는 스킬을 모두 고정했으면 낮출 수 있는 스킬이 없어 엄격 검색과 같다
  const relaxable = prepared.required.some((r) => !r.locked) || prepared.bonuses.some((b) => !b.locked)
  if (response.total > 0 || response.truncated || !(maxShortfall > 0) || !relaxable) return response
  const relaxed = new Searcher(db, request, prepared, hooks, started, maxShortfall)
  relaxed.run()
  return relaxed.response()
}

/** 찾은 결과 하나 = 탐색 클래스 조합에서 부위마다 고른 옵션 + 호석 옵션 (상위 limit 개만 보관) */
interface Leaf extends Ranked {
  talisman: number
  talismanOption: number
  /** 탐색 깊이(prepared.kinds 순서)별 클래스 인덱스 */
  chosen: Int32Array
  /** 깊이별 옵션 인덱스 (classes[d][chosen[d]].options) */
  options: Int32Array
  armorFill: FillResult
  weaponFill: FillResult
}

/** α 옵션을 고른 깊이와 옵션 인덱스 */
interface AlphaPick {
  depth: number
  option: number
}

/**
 * 잎 DP 상태 (§6.5): 앞 부위까지 고른 묶음으로 정해지는 방어구 슬롯 개수·α 옵션이 같은 조합들.
 * 장식주 채우기가 이 값으로만 정해져서 상태마다 한 번만 채운다
 */
interface LeafState {
  counts: SlotCounts
  /** 깊이 오름차순 */
  alphas: AlphaPick[]
  /** 이 상태가 되는 옵션 조합 수 (호석 옵션 수 포함) */
  ways: number
  /** 가장 높은 방어력 (무기 포함) */
  defense: number
  /** 가장 높은 내성순 정렬 속성 내성 (내성순이 아니면 0, §6.10) */
  res: number
  from: { prev: LeafState; group: OptionGroup }[]
}

/** countFits 의 한 부위 선택지: 슬롯이 같은 옵션 수 */
interface CountStep {
  slots: SlotCounts
  count: number
  /** 그중 가장 높은 정렬 속성 내성 (내성순이 아니면 0, bestFitRes) */
  res: number
}

/** 상위 결과 후보로 펼칠 때 같이 넘기는 값 */
interface Candidate {
  score: number
  /** 비선호 스킬이 없으면 1 (순위 키의 마지막) */
  clean: number
  armorFill: FillResult
  weaponFill: FillResult
  /** α 를 모두 짝으로 바꾼 결과와 장식주·남는 슬롯이 같다 (시리즈/그룹 발동이 같으면 그 결과의 대체 후보) */
  covered: boolean
}

const NO_SLOTS: Readonly<SlotCounts> = [0, 0, 0]
const EMPTY_FILL: FillResult = { score: 0, decos: [], unwanted: [], short: 0, waste: 0, combos: 0 }

const countOf = (ids: readonly number[], id: number) => {
  let n = 0
  for (const x of ids) if (x === id) n++
  return n
}

/** 장식주를 크기 큰 것부터 들어가는 가장 작은 슬롯에 넣고 남는 슬롯 개수 (채우기 결과의 남는 슬롯과 같다) */
function freeAfter(counts: Readonly<SlotCounts>, decos: readonly FillDeco[], kind: 'armor' | 'weapon'): SlotCounts {
  const free: SlotCounts = [counts[0], counts[1], counts[2]]
  const sizes = decos.filter((d) => d.kind === kind).map((d) => d.size).sort((a, b) => b - a)
  for (const size of sizes) {
    let level = size - 1
    while (level < 3 && free[level] === 0) level++
    if (level < 3) free[level]--
  }
  return free
}

const sameCounts = (a: Readonly<SlotCounts>, b: Readonly<SlotCounts>) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]

const addCounts = (a: Readonly<SlotCounts>, b: Readonly<SlotCounts>, sign = 1): SlotCounts => [
  a[0] + sign * b[0],
  a[1] + sign * b[1],
  a[2] + sign * b[2],
]

const decoIds = (decos: readonly { id: number }[]) => decos.map((d) => d.id).sort((a, b) => a - b)

class Searcher {
  private readonly db: GameDb
  private readonly request: SearchRequest
  private readonly p: Prepared
  private readonly hooks: EngineHooks
  private readonly limits: SearchLimits
  private readonly started: number
  /** 결과 정렬 기준 (accepts). 속성으로 정렬하면 내성순 (§6.10) */
  private readonly order: 'slots' | 'defense' | 'resistance'
  /** 방어구 슬롯을 쓰는 채우기 (both 풀이 있으면 무기 슬롯도 함께) */
  private readonly armorFillers: Fillers
  /** 엄격 검색이고 방어구 장식주가 스킬마다 1레벨 하나뿐이면: 부족분만으로 채우기가 정해진다 (§6.4) */
  private readonly simple: SimpleFill | null
  /** 방어구 장식주 여유분이 들어갈 슬롯 수 [레벨 1 이상, 2 이상, 3] (없으면 null, §6.8) */
  private readonly spareAtLeast: [number, number, number] | null

  // 탐색 상태 (되돌리기 방식으로 재사용)
  private readonly points: Int32Array
  private readonly bonusPieces: Int32Array
  /**
   * 고른 클래스마다 조건을 건 내성이 가장 높은 옵션의 값을 더한 것 (§6.9).
   * 내성으로 나누지 않은 마지막 부위 말고는 클래스의 내성이 하나라, 잎에서 그 부위 값을 빼면 앞 부위의 정확한 합이다
   */
  private readonly resSum: Int32Array
  /** 이 잎에서 마지막 부위 옵션 묶음이 넘어야 하는 내성 (filterLast 일 때만 쓴다) */
  private readonly lastNeed: Int32Array
  /** 이 잎의 마지막 부위에 내성 조건을 못 채우는 옵션이 있어 옵션 묶음을 거르는지 */
  private filterLast = false
  /** lastNeed 를 글로: 거른 묶음·선택지를 클래스마다 이 값으로 다시 쓴다 */
  private lastKey = ''
  private readonly lastGroupCache = new WeakMap<ArmorClass, Map<string, OptionGroup[]>>()
  private readonly armorSlots: SlotCounts = [0, 0, 0]
  private readonly weaponSlots: SlotCounts = [0, 0, 0]
  private readonly chosen: Int32Array
  private talismanIndex = 0
  private talismanPosition = 0
  private weaponResult: FillResult | null = null
  /** countFits 상태 배열 (다시 쓴다, 쓴 칸은 비워 둔다) */
  private countBuffers: [Float64Array, Float64Array] = [new Float64Array(0), new Float64Array(0)]
  /** bestFitRes 상태 배열 (다시 쓴다, 쓴 칸은 -Infinity 로 비워 둔다) */
  private resBuffers: [Float64Array, Float64Array] = [new Float64Array(0), new Float64Array(0)]
  /** accepts 가 순위 키를 넣어 묻는 데 다시 쓰는 키 (결과마다 불려서 새로 만들지 않는다, 힙에는 넣지 않는다) */
  private readonly probe: Ranked = { primary: 0, secondary: 0, tertiary: 0, quaternary: 0, seq: 0 }
  private readonly stepCache = new WeakMap<ArmorClass, Map<number | string, CountStep[]>>()

  /** 모자란 조합 찾기인지 (bound 의 처음 값이 0 보다 큼) */
  private readonly relaxed: boolean
  /** 받아들일 수 있는 모자란 레벨 합. 엄격 검색은 0, 모자란 조합 찾기는 더 적게 모자란 조합을 찾을 때마다 줄어든다 */
  private bound: number
  private results: TopK<Leaf>
  private total = 0
  private seq = 0
  private leaves = 0
  private nodes = 0
  private stopped = false
  private lastProgress = 0

  constructor(
    db: GameDb,
    request: SearchRequest,
    prepared: Prepared,
    hooks: EngineHooks,
    started: number,
    maxShortfall: number,
  ) {
    this.db = db
    this.request = request
    this.p = prepared
    this.hooks = hooks
    this.limits = { ...DEFAULT_LIMITS, ...hooks.limits }
    this.started = started
    this.order = prepared.sortRes >= 0 ? 'resistance' : request.sort === 'defense' ? 'defense' : 'slots'
    this.armorFillers = prepared.jointFill ?? prepared.armorFill
    this.relaxed = maxShortfall > 0
    this.bound = maxShortfall
    const simpleDecos = this.relaxed || prepared.jointFill ? null : prepared.armorFill.clean.simpleDecos()
    this.simple = simpleDecos ? new SimpleFill(simpleDecos, prepared.spare.armor) : null
    const [s1, s2, s3] = prepared.spare.armor
    this.spareAtLeast = s1 + s2 + s3 > 0 ? [s1 + s2 + s3, s2 + s3, s3] : null
    this.points = new Int32Array(prepared.required.length)
    this.bonusPieces = new Int32Array(prepared.bonuses.length)
    this.resSum = new Int32Array(prepared.resistances.length)
    this.lastNeed = new Int32Array(prepared.resistances.length)
    this.chosen = new Int32Array(prepared.kinds.length)
    this.results = this.newResults()
  }

  private newResults(): TopK<Leaf> {
    return new TopK<Leaf>(Math.max(1, Math.floor(this.request.limit) || DEFAULT_RESULT_LIMIT))
  }

  run(): void {
    const { talismans, weapon } = this.p
    for (let ti = 0; ti < talismans.length && !this.stopped; ti++) {
      const talisman = talismans[ti]
      this.talismanIndex = ti
      this.talismanPosition = ti
      this.points.set(weapon.pts)
      for (let i = 0; i < this.points.length; i++) this.points[i] += talisman.pts[i]
      this.bonusPieces.fill(0)
      this.resSum.fill(0)
      for (let level = 0; level < 3; level++) {
        this.armorSlots[level] = talisman.armorSlots[level]
        this.weaponSlots[level] = weapon.slotCounts[level] + talisman.weaponSlots[level]
      }
      // 무기 슬롯은 무기·호석으로 정해지므로 무기 장식주 여유분이 안 들어가면 이 호석은 볼 필요가 없다 (§6.8)
      if (!fitsSizes(this.weaponSlots, this.p.spare.weapon)) {
        this.progress(1, 1, true)
        continue
      }
      // 무기 스킬은 방어구와 무관하므로 호석마다 한 번만 판정한다
      this.weaponResult = this.p.weaponPrecheck
        ? this.fillDeficits(this.p.weaponFill, this.deficits(this.points, this.p.weaponFill, null), NO_SLOTS, this.weaponSlots, this.bound)
        : null
      if ((!this.p.weaponPrecheck || this.weaponResult) && this.feasible(0)) this.dfs(0)
      this.progress(1, 1, true)
    }
  }

  response(): SearchResponse {
    const items = this.results.sorted().map((leaf) => this.materialize(leaf))
    // 개수는 잎마다 DP 로 세는데, α 결과가 짝 결과와 시리즈/그룹 발동까지 같은지는 결과마다 봐서 세지 않는다 (§6.5).
    // 결과가 limit 보다 적으면 찾은 결과를 모두 넣었으므로 그 수가 정확하다
    const total = items.length < this.results.capacity ? items.length : Math.max(this.total, items.length)
    return {
      items,
      total,
      truncated: this.stopped,
      elapsedMs: performance.now() - this.started,
      shortfall: this.relaxed && total > 0 ? this.bound : 0,
    }
  }

  private dfs(depth: number): void {
    const { classes, kinds } = this.p
    if (depth === kinds.length) {
      this.leaf()
      return
    }
    const kindClasses = classes[depth]
    for (let ci = 0; ci < kindClasses.length && !this.stopped; ci++) {
      const cls = kindClasses[ci]
      this.apply(cls, 1)
      this.chosen[depth] = ci
      if (this.feasible(depth + 1)) this.dfs(depth + 1)
      this.apply(cls, -1)
      if ((++this.nodes & 1023) === 0) this.checkLimits()
      if (depth === 0) this.progress(ci + 1, kindClasses.length, false)
    }
  }

  private apply(cls: ArmorClass, sign: 1 | -1): void {
    const { pts, bonus, resMax, slotCounts } = cls
    for (let i = 0; i < pts.length; i++) this.points[i] += sign * pts[i]
    for (let j = 0; j < bonus.length; j++) this.bonusPieces[j] += sign * bonus[j]
    // 조건을 건 내성만 (내성순 정렬 속성은 그 뒤에 있다)
    for (let j = 0; j < this.resSum.length; j++) this.resSum[j] += sign * resMax[j]
    for (let level = 0; level < 3; level++) this.armorSlots[level] += sign * slotCounts[level]
  }

  /**
   * 남은 부위(depth 이후)를 최대로 가정해도 모자랄 수밖에 없는 레벨 합이 bound 를 넘으면 false (낙관적 상한만 사용).
   * 엄격 검색(bound 0)은 한 스킬이라도 모자라면 컷
   */
  private feasible(depth: number): boolean {
    const { required, bonuses, bounds, resistances } = this.p
    // 내성 조건: 남은 부위에 그 내성이 가장 높은 방어구를 껴도 모자라면 장식주와 상관없이 안 된다 (§6.9)
    const restRes = bounds.remainingRes[depth]
    for (let j = 0; j < resistances.length; j++) if (this.resSum[j] + restRes[j] < resistances[j].min) return false
    // 방어구 장식주 여유분: 레벨 k 이상 슬롯이 남은 부위를 다 더해도 모자라면 장식주와 상관없이 안 된다 (§6.8)
    if (this.spareAtLeast) {
      const [n1, n2, n3] = this.spareAtLeast
      const a = this.armorSlots
      const rest = bounds.remainingAtLeast[depth]
      if (a[2] + rest[2] < n3 || a[1] + a[2] + rest[1] < n2 || a[0] + a[1] + a[2] + rest[0] < n1) return false
    }
    let short = this.weaponResult?.short ?? 0
    const remainingBonus = bounds.remainingBonus[depth]
    for (let j = 0; j < bonuses.length; j++) {
      const bonus = bonuses[j]
      const pieces = this.bonusPieces[j] + remainingBonus[j]
      if (pieces < bonus.pieces && (bonus.locked || (short += bonusShortfall(bonus, pieces)) > this.bound)) return false
    }
    // 장식주로 못 채우는 스킬: 스킬마다 남은 부위의 최대 점수를 따로 더한 하한과, 부족분 합에서 남은 부위가 한 번에 줄 수 있는
    // 점수 합을 뺀 하한 중 큰 쪽 (스킬이 많으면 뒤쪽이 훨씬 정확하다)
    if (bounds.noneIndices.length > 0) {
      const remainingPts = bounds.remainingPts[depth]
      let perSkill = 0
      let deficit = 0
      for (const i of bounds.noneIndices) {
        const d = required[i].need - this.points[i]
        if (d <= 0) continue
        deficit += d
        if (d > remainingPts[i]) {
          if (required[i].locked) return false
          perSkill += d - remainingPts[i]
        }
      }
      if ((short += Math.max(perSkill, deficit - bounds.remainingNone[depth])) > this.bound) return false
    }
    // 방어구 장식주로 채우는 스킬: 임계 레벨별 스킬 묶음이 서로 포함 관계(1 ⊇ 2 ⊇ 3)라 가장 큰 하한 하나만 더한다.
    // 장식주 여유분이 비워 둘 슬롯은 장식주를 넣을 수 없으므로 그 잠재력 하한(sparePot)을 뺀다
    let armorShort = 0
    const slots = this.armorSlots
    for (const th of bounds.thresholds) {
      let deficit = 0
      for (const i of th.indices) {
        const d = required[i].need - this.points[i]
        if (d > 0) deficit += d
      }
      if (deficit === 0) continue
      const current = slots[0] * th.pot[0] + slots[1] * th.pot[1] + slots[2] * th.pot[2]
      const lack = deficit - current - th.remaining[depth] + th.sparePot
      if (lack > armorShort) {
        if (short + lack > this.bound) return false
        armorShort = lack
      }
    }
    // 고정한 스킬은 모자라면 안 되므로 그 스킬들만으로도 본다 (엄격 검색은 위 검사에 이미 들어 있다)
    if (this.relaxed) {
      for (const th of bounds.lockedThresholds) {
        let deficit = 0
        for (const i of th.indices) {
          const d = required[i].need - this.points[i]
          if (d > 0) deficit += d
        }
        const capacity = slots[0] * th.pot[0] + slots[1] * th.pot[1] + slots[2] * th.pot[2] + th.remaining[depth] - th.sparePot
        if (deficit > capacity) return false
      }
    }
    return true
  }

  /** 채우기가 맡은 스킬의 부족분. delta = α 옵션이 더 주는 점수 */
  private deficits(points: Int32Array, fillers: Fillers, delta: Int32Array | null): number[] {
    const { required } = this.p
    return fillers.indices.map((i) => Math.max(0, required[i].need - points[i] - (delta ? delta[i] : 0)))
  }

  private fillDeficits(
    fillers: Fillers,
    deficits: readonly number[],
    armor: Readonly<SlotCounts>,
    weapon: Readonly<SlotCounts>,
    tolerance: number,
  ): FillResult | null {
    const clean = fillers.clean.fill(deficits, armor, weapon, tolerance)
    if (!fillers.all || clean?.short === 0) return clean
    // 비선호 장식주는 그걸로 덜 모자랄 때만 쓴다
    const all = fillers.all.fill(deficits, armor, weapon, clean ? clean.short - 1 : tolerance)
    return all ?? clean
  }

  /** 방어구(공동) 장식주 채우기: 방어구 슬롯 개수 counts, α 옵션이 더 주는 점수 delta */
  private armorFillAt(
    points: Int32Array,
    counts: Readonly<SlotCounts>,
    delta: Int32Array | null,
    weaponSlots: Readonly<SlotCounts>,
    tolerance: number,
  ): FillResult | null {
    if (tolerance < 0) return null
    const deficits = this.deficits(points, this.armorFillers, delta)
    if (this.simple) return this.simple.fill(deficits, counts)
    const weapon = this.p.jointFill ? weaponSlots : NO_SLOTS
    return this.fillDeficits(this.armorFillers, deficits, counts, weapon, tolerance)
  }

  private leaf(): void {
    if (++this.leaves >= this.limits.maxLeaves) this.stopped = true
    // 잎마다 할 일이 많아(옵션 조합을 세고 펼친다) 마디 수와 함께 잎 수로도 시간·중단 요청을 본다
    if ((this.leaves & 63) === 0) this.checkLimits()
    const { kinds, talismans, required, bonuses, bounds, classes, weapon } = this.p

    // 시리즈/그룹 스킬과 장식주로 못 채우는 스킬은 고른 클래스만으로 정해진다 (클래스 안 옵션은 점수·소속이 같다)
    let baseShort = 0
    for (let j = 0; j < bonuses.length; j++) {
      if (this.bonusPieces[j] < bonuses[j].pieces) baseShort += bonusShortfall(bonuses[j], this.bonusPieces[j])
    }
    for (const i of bounds.noneIndices) if (this.points[i] < required[i].need) baseShort += required[i].need - this.points[i]
    if (baseShort > this.bound) return
    // 무기 장식주는 방어구 슬롯과 상관없다 (공동 채우기면 방어구 채우기에 들어 있다)
    let weaponFill: FillResult | null = EMPTY_FILL
    if (!this.p.jointFill) {
      weaponFill =
        this.weaponResult ??
        this.fillDeficits(
          this.p.weaponFill,
          this.deficits(this.points, this.p.weaponFill, null),
          NO_SLOTS,
          this.weaponSlots,
          this.bound - baseShort,
        )
      if (!weaponFill) return
    }
    // 클래스마다 슬롯이 가장 많은 대표 옵션으로 안 되면 이 잎의 어떤 옵션 조합도 안 된다 (α 옵션은 짝 + 장식주와 같다)
    const owner = this.armorFillAt(this.points, this.armorSlots, null, this.weaponSlots, this.bound - baseShort - weaponFill.short)
    if (!owner) return
    this.filterLast = this.prepareLastFilter()

    const talisman = talismans[this.talismanIndex]
    let unwanted = talisman.unwanted.length > 0 || weaponFill.unwanted.length > 0
    let maxDefense = weapon.defense
    for (let d = 0; d < kinds.length; d++) {
      const cls = classes[d][this.chosen[d]]
      if (cls.unwanted.length > 0) unwanted = true
      maxDefense += cls.defense
    }
    if (this.simple) {
      // 장식주가 부족분으로 정해진다: 개수는 넣을 수 있는지만 보면 되고(§6.5), 상위 결과에 들 수 있을 때만 옵션 조합을 펼친다.
      // 대표 옵션들(슬롯이 가장 많음)의 남는 슬롯·가장 높은 방어력·장식주가 다 들어가는 조합의 가장 높은 정렬 속성 내성이
      // 이 잎의 상한이다
      const deficits = this.deficits(this.points, this.armorFillers, null)
      this.total += this.countSimple(deficits)
      const simple = this.simple
      const maxRes = this.p.sortRes >= 0 ? this.bestFitRes(simple.withSpare(simple.sizes(deficits))) : 0
      if (this.accepts(owner.score + weaponFill.score, maxDefense, maxRes, unwanted ? 0 : 1)) {
        this.expand(baseShort, weaponFill, unwanted)
      }
      return
    }
    this.expand(baseShort, weaponFill, unwanted)
  }

  /**
   * 장식주가 스킬마다 하나뿐일 때 이 잎에서 결과가 되는 옵션 조합 수: 크기 k 이상 장식주 수 ≤ 레벨 k 이상 슬롯 수(k = 3, 2, 1)이면
   * 다 들어가므로, 부위마다 슬롯 수를 그 장식주 수에서 잘라 DP 로 센다. α 옵션 조합은 넣을 장식주(delta)가 모두 필요하면
   * 짝 결과와 장식주·남는 슬롯이 같아 짝 결과의 대체 후보로 보고 세지 않는다. 짝과 다른 시리즈/그룹 스킬의 발동이 달라져
   * 따로 보이는 결과는 결과마다 보므로 이 개수에서 빠진다 (드물다, response 참고). 더 넣어 넘치면 모두 따로 센다.
   * 장식주 여유분은 넣을 장식주에 더해 함께 센다 (SimpleFill.withSpare)
   */
  private countSimple(deficits: readonly number[]): number {
    const { kinds } = this.p
    const simple = this.simple!
    const indices = this.armorFillers.indices
    let total = this.countFits(simple.withSpare(simple.sizes(deficits)), null)
    // α 옵션 조합: 깊이마다 α 하나 또는 안 고름
    const alphaChoices = kinds.map((_, d) =>
      this.groupsAt(d)
        .filter((g) => g.swap !== null)
        .map((g) => ({ depth: d, option: g.options[0] })),
    )
    if (alphaChoices.every((list) => list.length === 0)) return total
    const visit = (d: number, picks: AlphaPick[]) => {
      if (d === kinds.length) {
        if (picks.length === 0) return
        const delta = this.deltaOf(picks)!
        const rest = indices.map((i, k) => Math.max(0, deficits[k] - delta[i]))
        // 넣을 장식주가 모두 필요하면 짝 결과와 장식주·남는 슬롯이 같다 (짝에만 있는 슬롯과 장식주 크기가 같다, prepare 의 findSwaps)
        if (indices.every((i, k) => delta[i] <= deficits[k])) return
        total += this.countFits(simple.withSpare(simple.sizes(rest)), picks)
        return
      }
      visit(d + 1, picks)
      for (const pick of alphaChoices[d]) visit(d + 1, [...picks, pick])
    }
    visit(0, [])
    return total
  }

  /**
   * 크기별 장식주 n(여유분 포함)이 다 들어가는 옵션 조합 수. picks 가 있으면 그 깊이는 그 α 옵션, 나머지 깊이는 α 가 아닌 옵션만.
   * 상태 = (레벨 3 슬롯 수, 레벨 2 이상, 전체) 를 각각 n 의 크기 3, 2 이상, 전체 개수에서 자른 것
   */
  private countFits(n: SizeCounts, picks: readonly AlphaPick[] | null): number {
    const { kinds, talismans } = this.p
    const t3 = n[2]
    const t23 = n[1] + n[2]
    const t123 = n[0] + n[1] + n[2]
    const talisman = talismans[this.talismanIndex]
    const stepsAt = (d: number) => {
      const pick = picks?.find((p) => p.depth === d)
      return this.countSteps(d, pick ? pick.option : -1)
    }
    if (t123 === 0) {
      // 넣을 장식주가 없으면 모든 조합
      let total = talisman.options.length
      for (let d = 0; d < kinds.length; d++) total *= stepsAt(d).reduce((sum, step) => sum + step.count, 0)
      return total
    }
    const s1 = t3 + 1
    const s2 = s1 * (t23 + 1)
    const size = s2 * (t123 + 1)
    if (this.countBuffers[0].length < size) this.countBuffers = [new Float64Array(size), new Float64Array(size)]
    let [cur, next] = this.countBuffers
    const t = talisman.armorSlots
    let live = [Math.min(t[2], t3) + s1 * Math.min(t[1] + t[2], t23) + s2 * Math.min(t[0] + t[1] + t[2], t123)]
    cur[live[0]] = talisman.options.length
    for (let d = 0; d < kinds.length; d++) {
      const steps = stepsAt(d)
      const nextLive: number[] = []
      for (const at of live) {
        const ways = cur[at]
        cur[at] = 0
        const a3 = at % s1
        const a23 = Math.floor(at / s1) % (t23 + 1)
        const a123 = Math.floor(at / s2)
        for (const step of steps) {
          const g = step.slots
          const to =
            Math.min(a3 + g[2], t3) + s1 * Math.min(a23 + g[1] + g[2], t23) + s2 * Math.min(a123 + g[0] + g[1] + g[2], t123)
          if (next[to] === 0) nextLive.push(to)
          next[to] += ways * step.count
        }
      }
      ;[cur, next] = [next, cur]
      live = nextLive
    }
    let total = 0
    for (const at of live) {
      if (at === size - 1) total = cur[at]
      cur[at] = 0
    }
    return total
  }

  /**
   * 내성순 (§6.10): 크기별 장식주 n(여유분 포함)이 다 들어가는 옵션 조합 중 가장 높은 정렬 속성 내성 (없으면 -Infinity).
   * countFits 와 같은 상태마다 가장 높은 내성을 남긴다. 클래스마다 가장 높은 내성의 합은 그 방어구의 슬롯이 모자라 못 이룰 때가
   * 많아서, 이 값을 잎의 순위 상한으로 써야 펼칠 잎이 준다. α 옵션은 보지 않는다: α 조합이 들어가면 짝으로 바꾼 조합도
   * 들어가고(짝에만 있는 슬롯에 바꿀 때 빼는 장식주가 들어간다) 내성이 같다
   */
  private bestFitRes(n: SizeCounts): number {
    const { kinds, talismans } = this.p
    const t3 = n[2]
    const t23 = n[1] + n[2]
    const t123 = n[0] + n[1] + n[2]
    const s1 = t3 + 1
    const s2 = s1 * (t23 + 1)
    const size = s2 * (t123 + 1)
    if (this.resBuffers[0].length < size) {
      this.resBuffers = [new Float64Array(size).fill(-Infinity), new Float64Array(size).fill(-Infinity)]
    }
    let [cur, next] = this.resBuffers
    const t = talismans[this.talismanIndex].armorSlots
    let live = [Math.min(t[2], t3) + s1 * Math.min(t[1] + t[2], t23) + s2 * Math.min(t[0] + t[1] + t[2], t123)]
    cur[live[0]] = 0
    for (let d = 0; d < kinds.length; d++) {
      const steps = this.countSteps(d, -1)
      const nextLive: number[] = []
      for (const at of live) {
        const res = cur[at]
        cur[at] = -Infinity
        const a3 = at % s1
        const a23 = Math.floor(at / s1) % (t23 + 1)
        const a123 = Math.floor(at / s2)
        for (const step of steps) {
          const g = step.slots
          const to =
            Math.min(a3 + g[2], t3) + s1 * Math.min(a23 + g[1] + g[2], t23) + s2 * Math.min(a123 + g[0] + g[1] + g[2], t123)
          if (next[to] === -Infinity) nextLive.push(to)
          if (res + step.res > next[to]) next[to] = res + step.res
        }
      }
      ;[cur, next] = [next, cur]
      live = nextLive
    }
    let best = -Infinity
    for (const at of live) {
      if (at === size - 1) best = cur[at]
      cur[at] = -Infinity
    }
    return best
  }

  /**
   * countFits 의 깊이 d 선택지: option ≥ 0 이면 그 α 옵션 하나, 아니면 α 가 아닌 옵션을 슬롯이 같은 것끼리 (내성으로 나뉜 묶음도 합친다).
   * 마지막 부위를 내성으로 거르는 잎이면 거른 묶음으로 (거르는 값마다 따로 둔다)
   */
  private countSteps(d: number, option: number): CountStep[] {
    const cls = this.p.classes[d][this.chosen[d]]
    const filtered = this.filterLast && d === this.p.kinds.length - 1
    let cache = this.stepCache.get(cls)
    if (!cache) {
      cache = new Map()
      this.stepCache.set(cls, cache)
    }
    const key = filtered ? `${option}|${this.lastKey}` : option
    let steps = cache.get(key)
    if (!steps) {
      const bySlots = new Map<string, CountStep>()
      for (const g of filtered ? this.groupsAt(d) : cls.groups) {
        if (option >= 0 ? g.swap === null || g.options[0] !== option : g.swap !== null) continue
        const slotsKey = g.slotCounts.join(',')
        const res = this.sortResOf(g.res)
        const step = bySlots.get(slotsKey)
        if (step) {
          step.count += g.options.length
          step.res = Math.max(step.res, res)
        } else {
          bySlots.set(slotsKey, { slots: g.slotCounts, count: g.options.length, res })
        }
      }
      steps = [...bySlots.values()]
      cache.set(key, steps)
    }
    return steps
  }

  /**
   * 내성 조건 (§6.9): 마지막 부위 클래스는 내성으로 나누지 않아서, 앞 부위 합으로 모자라는 만큼(lastNeed)을 넘는 옵션 묶음만 쓴다.
   * 그 클래스의 모든 옵션이 넘으면 false (거를 필요가 없다)
   */
  private prepareLastFilter(): boolean {
    const { resistances, classes, kinds } = this.p
    const d = kinds.length - 1
    const last = classes[d][this.chosen[d]]
    let filter = false
    for (let j = 0; j < resistances.length; j++) {
      // 클래스의 가장 낮은 값보다 낮으면 모두 넘으므로 그 값으로 (같은 거른 묶음을 다시 쓰게)
      this.lastNeed[j] = Math.max(resistances[j].min - (this.resSum[j] - last.resMax[j]), last.resMin[j])
      if (this.lastNeed[j] > last.resMin[j]) filter = true
    }
    if (filter) this.lastKey = this.lastNeed.join(',')
    return filter
  }

  /** 잎 DP 가 깊이 d 에서 쓰는 옵션 묶음: 마지막 부위는 내성 조건을 채우는 묶음만 */
  private groupsAt(d: number): readonly OptionGroup[] {
    const cls = this.p.classes[d][this.chosen[d]]
    if (!this.filterLast || d !== this.p.kinds.length - 1) return cls.groups
    let cache = this.lastGroupCache.get(cls)
    if (!cache) {
      cache = new Map()
      this.lastGroupCache.set(cls, cache)
    }
    let groups = cache.get(this.lastKey)
    if (!groups) {
      // 묶음의 내성 뒤쪽에 붙은 내성순 정렬 속성은 거르지 않는다
      groups = cls.groups.filter((g) => this.lastNeed.every((need, j) => g.res[j] >= need))
      cache.set(this.lastKey, groups)
    }
    return groups
  }

  /**
   * α 조합의 그 스킬(id) 부위 수가 pieces 일 때, α 를 모두 짝으로 바꾼 결과와 발동 단계가 같고 그 결과에서 하나만 α 로 둔 결과도
   * 같은지 (카드는 부위마다 고르게 보여 준다)
   */
  private sameActivationOf(id: number, pieces: number, swaps: readonly { alpha: ArmorOption; beta: ArmorOption }[]): boolean {
    const skill = this.db.skill(id)
    const diffs = swaps.map(({ alpha, beta }) => countOf(beta.bonusIds, id) - countOf(alpha.bonusIds, id))
    const all = pieces + diffs.reduce((s, x) => s + x, 0)
    const level = bonusLevel(skill, all)
    if (bonusLevel(skill, pieces) !== level) return false
    return swaps.length === 1 || diffs.every((x) => bonusLevel(skill, all - x) === level)
  }

  /** 잎의 옵션 조합을 상태별로 채우고, 세고(장식주가 하나뿐이 아닐 때), 상위 결과 후보를 펼친다 */
  private expand(baseShort: number, weaponFill: FillResult, unwanted: boolean): void {
    const states = this.leafStates()
    // 슬롯이 많은 상태부터 (모자란 조합 찾기에서 더 적게 모자란 상태를 먼저 만나 덜 버린다)
    states.sort((a, b) => slotScore(b.counts) - slotScore(a.counts))
    for (const state of states) {
      const delta = this.deltaOf(state.alphas)
      const fill = this.armorFillAt(this.points, state.counts, delta, this.weaponSlots, this.bound - baseShort - weaponFill.short)
      if (!fill) continue
      const short = baseShort + weaponFill.short + fill.short
      if (short > this.bound) continue
      if (short < this.bound) {
        // 더 적게 모자란 조합을 찾았으면 지금까지 모은 결과는 버리고 이만큼 모자란 조합만 모은다
        this.bound = short
        this.results = this.newResults()
        this.total = 0
      }
      // 짝(β)으로 모두 바꾼 결과와 장식주·남는 슬롯이 같으면 시리즈/그룹 발동만 결과마다 보면 된다 (§6.2.1)
      const covered = state.alphas.length > 0 && this.fillCovered(this.points, state, fill)
      if (!this.simple && !covered) this.total += state.ways
      const clean = unwanted || fill.unwanted.length > 0 ? 0 : 1
      const score = fill.score + weaponFill.score
      if (!this.accepts(score, state.defense, state.res, clean)) continue
      this.enumerate(state, { score, clean, armorFill: fill, weaponFill, covered })
    }
  }

  /**
   * 이 값(상한이어도 된다)의 결과가 상위 결과에 들 수 있는지. 정렬 기준대로의 순위 키(클수록 앞, §6.5)를 probe 에 넣어 묻는다:
   * 남는 슬롯순 = 남는 슬롯 점수 → 방어력, 방어력순 = 방어력 → 남는 슬롯 점수, 내성순 = 정렬 속성 내성 → 남는 슬롯 점수 → 방어력
   * (§6.10). 모두 같으면 비선호 스킬이 없는 쪽(clean = 1), 먼저 찾은 쪽. 결과를 넣을 때는 probe 의 키를 그대로 쓴다
   */
  private accepts(score: number, defense: number, res: number, clean: number): boolean {
    const probe = this.probe
    switch (this.order) {
      case 'slots':
        probe.primary = score
        probe.secondary = defense
        probe.tertiary = clean
        probe.quaternary = 0
        break
      case 'defense':
        probe.primary = defense
        probe.secondary = score
        probe.tertiary = clean
        probe.quaternary = 0
        break
      case 'resistance':
        probe.primary = res
        probe.secondary = score
        probe.tertiary = defense
        probe.quaternary = clean
    }
    probe.seq = this.seq
    return this.results.accepts(probe)
  }

  /** 내성순 정렬 속성의 내성 (res 는 resElements 순서, 내성순이 아니면 0) */
  private sortResOf(res: Int32Array): number {
    return this.p.sortRes < 0 ? 0 : res[this.p.sortRes]
  }

  /** α 옵션들이 더 주는 점수 합 */
  private deltaOf(alphas: readonly AlphaPick[]): Int32Array | null {
    if (alphas.length === 0) return null
    const delta = new Int32Array(this.p.required.length)
    for (const { depth, option } of alphas) {
      const swap = this.p.classes[depth][this.chosen[depth]].options[option].swap!
      for (let i = 0; i < delta.length; i++) delta[i] += swap.delta[i]
    }
    return delta
  }

  /** 잎의 옵션 묶음 조합을 방어구 슬롯 개수·α 옵션별로 합친다 */
  private leafStates(): LeafState[] {
    const { kinds, talismans, weapon } = this.p
    const talisman = talismans[this.talismanIndex]
    const start: LeafState = {
      counts: [talisman.armorSlots[0], talisman.armorSlots[1], talisman.armorSlots[2]],
      alphas: [],
      ways: talisman.options.length,
      defense: weapon.defense,
      res: 0,
      from: [],
    }
    // 내성순 (§6.10): 상위 결과가 다 찼으면, 뒤 부위에 내성이 가장 높은 묶음을 껴도 마지막 결과의 내성보다 낮은 묶음은 넣지 않는다.
    // 장식주가 하나뿐일 때만: 개수는 따로 세서(countSimple) 상태에는 순위에 들 수 있는 조합만 있으면 된다
    const floor = this.simple && this.p.sortRes >= 0 ? (this.results.last()?.primary ?? -Infinity) : -Infinity
    /** [d] = 깊이 d 부터 부위마다 가장 높은 묶음 내성의 합 (자를 때만) */
    let restRes: Float64Array | null = null
    if (floor > -Infinity) {
      restRes = new Float64Array(kinds.length + 1)
      for (let d = kinds.length - 1; d >= 0; d--) {
        restRes[d] = restRes[d + 1] + Math.max(...this.groupsAt(d).map((g) => this.sortResOf(g.res)))
      }
    }
    let layer = [start]
    for (let d = 0; d < kinds.length; d++) {
      const groups = this.groupsAt(d)
      const next = new Map<string, LeafState>()
      for (const state of layer) {
        for (const group of groups) {
          if (restRes && state.res + this.sortResOf(group.res) + restRes[d + 1] < floor) continue
          const counts = addCounts(state.counts, group.slotCounts)
          const alphas = group.swap ? [...state.alphas, { depth: d, option: group.options[0] }] : state.alphas
          const key = `${counts[0]},${counts[1]},${counts[2]}|${alphas.map((a) => `${a.depth}:${a.option}`).join(',')}`
          let target = next.get(key)
          if (!target) {
            target = { counts, alphas, ways: 0, defense: -1, res: -Infinity, from: [] }
            next.set(key, target)
          }
          target.ways += state.ways * group.options.length
          target.defense = Math.max(target.defense, state.defense + group.defense)
          target.res = Math.max(target.res, state.res + this.sortResOf(group.res))
          target.from.push({ prev: state, group })
        }
      }
      layer = [...next.values()]
    }
    return layer
  }

  /** α 를 모두 짝(β)으로 바꾼 결과, 그리고 α 를 하나씩만 바꾼 결과가 장식주·남는 슬롯까지 β 결과와 같은지 (시리즈/그룹 제외) */
  private fillCovered(points: Int32Array, state: LeafState, fill: FillResult): boolean {
    const swaps = state.alphas.map(({ depth, option }) => this.p.classes[depth][this.chosen[depth]].options[option].swap!)
    let betaCounts: SlotCounts = state.counts
    for (const swap of swaps) betaCounts = addCounts(betaCounts, swap.extra)
    // 같은 결과라면 모자란 레벨도 같다
    const betaFill = this.armorFillAt(points, betaCounts, null, this.weaponSlots, fill.short)
    if (!betaFill || !this.sameFill(betaCounts, betaFill, state.counts, fill, swaps, this.weaponSlots)) return false
    if (swaps.length === 1) return true
    return swaps.every((swap) => {
      const counts = addCounts(betaCounts, swap.extra, -1)
      const oneFill = this.armorFillAt(points, counts, swap.delta, this.weaponSlots, fill.short)
      return oneFill !== null && this.sameFill(betaCounts, betaFill, counts, oneFill, [swap], this.weaponSlots)
    })
  }

  /** β 쪽 장식주 = α 쪽 장식주 + 빼는 장식주이고 남는 슬롯·모자란 레벨·비선호 장식주가 같은지 */
  private sameFill(
    betaCounts: Readonly<SlotCounts>,
    betaFill: FillResult,
    counts: Readonly<SlotCounts>,
    fill: FillResult,
    swaps: readonly OptionSwap[],
    weaponSlots: Readonly<SlotCounts>,
  ): boolean {
    if (fill.short !== betaFill.short || fill.unwanted.join() !== betaFill.unwanted.join()) return false
    const withJewels = decoIds([...fill.decos.map((d) => d.decoration), ...swaps.flatMap((s) => s.jewels)])
    const betaDecos = decoIds(betaFill.decos.map((d) => d.decoration))
    if (withJewels.length !== betaDecos.length || withJewels.some((id, i) => id !== betaDecos[i])) return false
    if (!sameCounts(freeAfter(counts, fill.decos, 'armor'), freeAfter(betaCounts, betaFill.decos, 'armor'))) return false
    if (!this.p.jointFill) return true
    return sameCounts(freeAfter(weaponSlots, fill.decos, 'weapon'), freeAfter(weaponSlots, betaFill.decos, 'weapon'))
  }


  /** 상태에 드는 옵션 조합을 방어력 높은 순으로 펼쳐 상위 결과 후보로 넣는다 (넣을 수 없는 쪽은 자른다) */
  private enumerate(final: LeafState, candidate: Candidate): void {
    const { kinds } = this.p
    const path: OptionGroup[] = new Array(kinds.length)
    // 뒤 부위부터 거슬러 올라가며 묶음 조합을 고른다. suffix = 이미 고른 뒤 부위의 최고 방어력 합, suffixRes = 그 정렬 속성 내성 합
    const walk = (state: LeafState, depth: number, suffix: number, suffixRes: number) => {
      if (this.stopped) return
      if (depth < 0) {
        this.pushOptions(path, final.alphas, candidate, suffixRes)
        return
      }
      for (const { prev, group } of state.from) {
        const res = suffixRes + this.sortResOf(group.res)
        if (!this.accepts(candidate.score, prev.defense + group.defense + suffix, prev.res + res, candidate.clean)) continue
        path[depth] = group
        walk(prev, depth - 1, suffix + group.defense, res)
      }
    }
    walk(final, kinds.length - 1, 0, 0)
  }

  /** 묶음 조합(path)의 옵션 조합을 넣는다. res = 이 조합의 정렬 속성 내성 (묶음 안 옵션은 내성이 같다) */
  private pushOptions(
    path: readonly OptionGroup[],
    alphas: readonly AlphaPick[],
    candidate: Candidate,
    res: number,
  ): void {
    const { kinds, classes, talismans, weapon } = this.p
    const talisman = talismans[this.talismanIndex]
    const picks = new Int32Array(kinds.length)
    const rest = new Float64Array(kinds.length + 1)
    for (let d = kinds.length - 1; d >= 0; d--) rest[d] = rest[d + 1] + path[d].defense
    // 짝 결과와 장식주·남는 슬롯이 같은 상태는 시리즈/그룹 발동이 달라지는 조합만 따로 결과다: 짝과 다른 스킬(ids)의 부위 수를 세며
    // 남은 부위로 될 수 있는 범위에서 발동이 달라질 수 없으면 자른다
    const swaps = alphas.map(({ depth, option }) => {
      const options = classes[depth][this.chosen[depth]].options
      return { alpha: options[option], beta: options[options[option].swap!.partner] }
    })
    const ids = candidate.covered ? [...new Set(swaps.flatMap((s) => s.alpha.swap!.bonusDiff))] : []
    const optionsAt = (d: number) => classes[d][this.chosen[d]].options
    const low = ids.map(() => new Int32Array(kinds.length + 1))
    const high = ids.map(() => new Int32Array(kinds.length + 1))
    ids.forEach((id, k) => {
      for (let d = kinds.length - 1; d >= 0; d--) {
        const counts = path[d].options.map((i) => countOf(optionsAt(d)[i].bonusIds, id))
        low[k][d] = low[k][d + 1] + Math.min(...counts)
        high[k][d] = high[k][d + 1] + Math.max(...counts)
      }
    })
    const pieces = ids.map((id) => countOf(weapon.bonusIds, id))
    const mayDiffer = (d: number) =>
      ids.some((id, k) => {
        for (let n = pieces[k] + low[k][d]; n <= pieces[k] + high[k][d]; n++) if (!this.sameActivationOf(id, n, swaps)) return true
        return false
      })
    const pick = (d: number, defense: number) => {
      if (candidate.covered && !mayDiffer(d)) return
      if (d === kinds.length) {
        for (let t = 0; t < talisman.options.length; t++) {
          if (!this.accepts(candidate.score, defense, res, candidate.clean)) return
          // accepts 가 probe 에 넣어 둔 이 결과의 순위 키
          const { primary, secondary, tertiary, quaternary } = this.probe
          this.results.push({
            primary,
            secondary,
            tertiary,
            quaternary,
            seq: this.seq++,
            talisman: this.talismanIndex,
            talismanOption: t,
            chosen: this.chosen.slice(),
            options: picks.slice(),
            armorFill: candidate.armorFill,
            weaponFill: candidate.weaponFill,
          })
        }
        return
      }
      const options = classes[d][this.chosen[d]].options
      for (const index of path[d].options) {
        const next = defense + options[index].defense
        // 옵션이 방어력 높은 순이라 여기서 안 되면 뒤 옵션도 안 된다
        if (!this.accepts(candidate.score, next + rest[d + 1], res, candidate.clean)) break
        picks[d] = index
        ids.forEach((id, k) => (pieces[k] += countOf(options[index].bonusIds, id)))
        pick(d + 1, next)
        ids.forEach((id, k) => (pieces[k] -= countOf(options[index].bonusIds, id)))
      }
    }
    pick(0, weapon.defense)
  }

  private checkLimits(): void {
    if (performance.now() - this.started > this.limits.maxMillis || this.hooks.shouldStop?.()) this.stopped = true
  }

  private progress(done: number, total: number, force: boolean): void {
    if (!this.hooks.onProgress) return
    const now = performance.now()
    if (!force && now - this.lastProgress < PROGRESS_INTERVAL_MS) return
    this.lastProgress = now
    const ratio = (this.talismanPosition + done / total) / this.p.talismans.length
    this.hooks.onProgress({ ratio: Math.min(1, ratio), found: this.total, relaxed: this.relaxed })
  }

  /** 상위 결과를 실제 장비·장식주 배치로 바꾸고 computeBuild 로 최종 값을 계산한다 */
  private materialize(leaf: Leaf): SearchResultItem {
    const { classes, kinds, talismans, weapon, customTalismans, excluded, required } = this.p
    const talisman = talismans[leaf.talisman]
    const talismanOption = talisman.options[leaf.talismanOption]
    const build = emptyBuild()
    build.weapon = this.request.weapon.choice
    build.talisman = talismanOption[0]?.ref ?? null

    const options = kinds.map((_, d) => classes[d][leaf.chosen[d]].options[leaf.options[d]])
    const armorSlotLevels = {} as Record<ArmorKind, SlotLevel[]>
    kinds.forEach((kind, d) => {
      const rep = options[d].members[0]
      armorSlotLevels[kind] = rep ? options[d].slots : []
      build.armor[kind] = rep ? { id: rep.id, transcend: this.request.transcend && canTranscend(rep) } : null
    })

    // α/β 바꾸기: α 옵션이 없는 결과에서 짝(α)으로 바꿔도 스킬·남는 슬롯이 같은 부위와 함께 바꿀 수 있는 조합
    const points = Int32Array.from(required, (_, i) => {
      let total = weapon.pts[i] + talisman.pts[i]
      kinds.forEach((_, d) => (total += classes[d][leaf.chosen[d]].pts[i]))
      return total
    })
    const swaps = this.swapsOf(leaf, options, points)

    // computeBuild 의 슬롯 순서(무기 → 방어구 5부위 → 호석)대로 실제 슬롯 목록을 만든다
    const concrete: ConcreteSlot[] = []
    weapon.slots.forEach((level, index) => concrete.push({ key: 'weapon', index, slot: { kind: 'weapon', level } }))
    for (const kind of ARMOR_KINDS) {
      armorSlotLevels[kind].forEach((level, index) => concrete.push({ key: kind, index, slot: { kind: 'armor', level } }))
    }
    talisman.slots.forEach((slot, index) => concrete.push({ key: 'talisman', index, slot }))
    const decos = [...leaf.armorFill.decos, ...leaf.weaponFill.decos]
    // 바꿀 때 빼는 장식주를 그 부위의 짝에만 있는 슬롯에 먼저 넣어 두면, 바꿀 때 그 부위 장식주만 빼면 된다.
    // 바꿀 수 있는 α 를 부위마다 하나씩 → 함께 바꿀 수 있는 가장 큰 조합 → 고정 없이 순서로 시도한다
    const pinsOf = (picks: readonly { depth: number; alpha: ArmorOption }[]) =>
      picks.map(({ depth, alpha }) => ({ key: kinds[depth], swap: alpha.swap! }))
    const firstPerDepth = kinds.flatMap((_, d) => {
      const alpha = swaps.alphas.find((a) => a.depth === d && a.alpha.swap!.jewels.length > 0)
      return alpha ? [alpha] : []
    })
    const largest = swaps.sets.at(-1) ?? []
    const assigned =
      assignWithPins(concrete, decos, pinsOf(firstPerDepth)) ??
      assignWithPins(concrete, decos, pinsOf(largest)) ??
      assignDecorations(concrete, decos)
    if (!assigned) throw new Error('장식주 배치에 실패했습니다 (검색 엔진 오류)')
    for (const key of EQUIP_KEYS) build.decorations[key] = []
    for (const slot of concrete) build.decorations[slot.key][slot.index] = assigned.get(slot)?.id ?? null

    // 대체 후보: 같은 옵션(스킬·슬롯이 같음) + 함께 바꿔도 결과가 같은 α
    const armor = {} as Record<ArmorKind, number[]>
    const swapInfo: SearchResultItem['swaps'] = {}
    kinds.forEach((kind, d) => {
      const alphas = swaps.alphas.filter((a) => a.depth === d)
      armor[kind] = [...options[d].members, ...alphas.flatMap((a) => a.alpha.members)].map((p) => p.id)
      for (const { alpha } of alphas) {
        const key = alpha.members[0].id
        for (const piece of alpha.members) swapInfo[piece.id] = { key, jewels: alpha.swap!.jewels.map((j) => j.id) }
      }
    })
    // 실제 방어구 조합 수: 함께 바꿀 수 있는 α 조합(안 바꾸는 것 포함)마다 부위별 후보 수의 곱
    let variantCount = 0
    for (const set of [[], ...swaps.sets]) {
      let product = 1
      kinds.forEach((_, d) => {
        const alpha = set.find((a) => a.depth === d)
        product *= Math.max(1, (alpha ? alpha.alpha : options[d]).members.length)
      })
      variantCount += product
    }

    const summary = computeBuild(this.db, build, customTalismans)
    return {
      id: `${leaf.talisman}.${leaf.talismanOption}-${leaf.chosen.join('.')}-${leaf.options.join('.')}`,
      armor,
      talismans: talismanOption.map((m) => m.ref),
      decorations: build.decorations,
      swaps: swapInfo,
      swapSets: swaps.sets.map((set) =>
        Object.fromEntries(set.map(({ depth, alpha }) => [kinds[depth], alpha.members[0].id])),
      ),
      skillLevels: [...activeSkillLevels(summary)].map(([skillId, level]) => ({ skillId, level })),
      unwantedSkills: unwantedSkillsOf(summary, excluded),
      freeSlots: summary.freeSlots,
      defense: summary.defense.max,
      variantCount,
    }
  }

  /**
   * α 옵션이 없는 결과에서 짝(α)으로 바꿀 수 있는 α 들과, 함께 바꿔도 스킬·남는 슬롯이 같은 조합 (작은 조합부터, 부위마다 α 하나).
   * 하나만 바꿔도 같은 α 만 후보로 보이고, 조합은 그 α 들 중에서 고른다
   */
  private swapsOf(
    leaf: Leaf,
    options: readonly ArmorOption[],
    points: Int32Array,
  ): { alphas: { depth: number; alpha: ArmorOption }[]; sets: { depth: number; alpha: ArmorOption }[][] } {
    const none = { alphas: [], sets: [] }
    if (options.some((o) => o.swap)) return none
    const { classes, kinds, talismans, weapon } = this.p
    const candidates: { depth: number; alpha: ArmorOption }[] = []
    kinds.forEach((_, d) => {
      for (const alpha of classes[d][leaf.chosen[d]].options) {
        if (alpha.swap?.partner === leaf.options[d]) candidates.push({ depth: d, alpha })
      }
    })
    if (candidates.length === 0) return none
    const talisman = talismans[leaf.talisman]
    const weaponSlots = addCounts(weapon.slotCounts, talisman.weaponSlots)
    let betaCounts: SlotCounts = [talisman.armorSlots[0], talisman.armorSlots[1], talisman.armorSlots[2]]
    for (const option of options) betaCounts = addCounts(betaCounts, option.slotCounts)
    const betaFill = leaf.armorFill
    const same = (set: readonly { depth: number; alpha: ArmorOption }[]) => {
      let counts = betaCounts
      const delta = new Int32Array(points.length)
      for (const { alpha } of set) {
        counts = addCounts(counts, alpha.swap!.extra, -1)
        for (let i = 0; i < delta.length; i++) delta[i] += alpha.swap!.delta[i]
      }
      const fill = this.armorFillAt(points, counts, delta, weaponSlots, betaFill.short)
      const swapsOfSet = set.map((s) => s.alpha.swap!)
      if (!fill || !this.sameFill(betaCounts, betaFill, counts, fill, swapsOfSet, weaponSlots)) return false
      // 시리즈/그룹 발동: β 결과와 이 조합으로 바꾼 결과
      const ids = new Set(set.flatMap((s) => s.alpha.swap!.bonusDiff))
      for (const id of ids) {
        let beta = countOf(weapon.bonusIds, id)
        for (const option of options) beta += countOf(option.bonusIds, id)
        let swapped = beta
        for (const { depth, alpha } of set) swapped += countOf(alpha.bonusIds, id) - countOf(options[depth].bonusIds, id)
        const skill = this.db.skill(id)
        if (bonusLevel(skill, beta) !== bonusLevel(skill, swapped)) return false
      }
      return true
    }
    const single = candidates.filter((c) => same([c]))
    const sets: { depth: number; alpha: ArmorOption }[][] = []
    // 하나만 바꿔도 같은 α 들로 만든 조합 (부위마다 하나) 중 함께 바꿔도 같은 것
    const build = (from: number, set: { depth: number; alpha: ArmorOption }[]) => {
      for (let i = from; i < single.length; i++) {
        if (set.some((s) => s.depth === single[i].depth)) continue
        const next = [...set, single[i]]
        if (next.length === 1 || same(next)) sets.push(next)
        build(i + 1, next)
      }
    }
    build(0, [])
    sets.sort((a, b) => a.length - b.length)
    return { alphas: single, sets }
  }
}

/**
 * pins 의 장식주(α 로 바꿀 때 빼는 것)를 그 부위의 짝에만 있는 슬롯과 같은 레벨 슬롯에 먼저 넣고 나머지는 assignDecorations 로.
 * 실패하면 null
 */
function assignWithPins(
  slots: readonly ConcreteSlot[],
  decos: readonly FillDeco[],
  pins: readonly { key: ArmorKind; swap: OptionSwap }[],
): Map<ConcreteSlot, Decoration> | null {
  if (pins.length === 0 || pins.every((p) => p.swap.jewels.length === 0)) return null
  const rest = [...decos]
  const pinned = new Map<ConcreteSlot, Decoration>()
  for (const { key, swap } of pins) {
    const extra = [...swap.extra]
    for (const jewel of [...swap.jewels].sort((a, b) => b.size - a.size)) {
      // 짝에만 있는 슬롯 레벨 중 이 장식주가 들어가는 가장 작은 것
      let level = jewel.size - 1
      while (level < 3 && extra[level] === 0) level++
      if (level >= 3) return null
      extra[level]--
      const slot = slots.find((s) => s.key === key && s.slot.level === level + 1 && !pinned.has(s))
      const at = rest.findIndex((d) => d.decoration.id === jewel.id)
      if (!slot || at < 0) return null
      pinned.set(slot, jewel)
      rest.splice(at, 1)
    }
  }
  const others = assignDecorations(
    slots.filter((s) => !pinned.has(s)),
    rest,
  )
  if (!others) return null
  for (const [slot, deco] of pinned) others.set(slot, deco)
  return others
}
