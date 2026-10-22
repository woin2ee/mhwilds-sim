// 스킬 검색 엔진 (DESIGN.md §6). 순수 동기 함수 — Web Worker(search.worker.ts)와 테스트에서 그대로 실행한다.
import type { GameDb } from '../../data/db'
import { ARMOR_KINDS, type ArmorKind, type SlotLevel } from '../../data/types'
import { activeSkillLevels, computeBuild, unwantedSkillsOf } from '../calc'
import { canTranscend } from '../transcend'
import { emptyBuild, EQUIP_KEYS } from '../types'
import { assignDecorations, type ConcreteSlot, type FillResult, type SlotCounts } from './decoFill'
import { prepare, type Fillers, type Prepared } from './prepare'
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
  if (!prepared) {
    return {
      preferred: [],
      deprioritized: [],
      totalPreferred: 0,
      totalDeprioritized: 0,
      truncated: false,
      elapsedMs: performance.now() - started,
    }
  }
  const searcher = new Searcher(db, request, prepared, hooks, started)
  searcher.run()
  return searcher.response()
}

/** 찾은 조합 (상위 limit 개만 보관) */
interface Leaf extends Ranked {
  talisman: number
  /** 탐색 깊이(prepared.kinds 순서)별 클래스 인덱스 */
  chosen: Int32Array
  armorFill: FillResult
  weaponFill: FillResult
}

const NO_SLOTS: Readonly<SlotCounts> = [0, 0, 0]
const EMPTY_FILL: FillResult = { score: 0, decos: [], unwanted: [] }

class Searcher {
  private readonly db: GameDb
  private readonly request: SearchRequest
  private readonly p: Prepared
  private readonly hooks: EngineHooks
  private readonly limits: SearchLimits
  private readonly started: number

  // 탐색 상태 (되돌리기 방식으로 재사용)
  private readonly points: Int32Array
  private readonly bonusPieces: Int32Array
  private readonly armorSlots: SlotCounts = [0, 0, 0]
  private readonly weaponSlots: SlotCounts = [0, 0, 0]
  private readonly chosen: Int32Array
  private talismanIndex = 0
  private talismanPosition = 0
  private weaponResult: FillResult | null = null

  private readonly preferred: TopK<Leaf>
  private readonly deprioritized: TopK<Leaf>
  private totalPreferred = 0
  private totalDeprioritized = 0
  private seq = 0
  private leaves = 0
  private nodes = 0
  private stopped = false
  private lastProgress = 0

  constructor(db: GameDb, request: SearchRequest, prepared: Prepared, hooks: EngineHooks, started: number) {
    this.db = db
    this.request = request
    this.p = prepared
    this.hooks = hooks
    this.limits = { ...DEFAULT_LIMITS, ...hooks.limits }
    this.started = started
    this.points = new Int32Array(prepared.required.length)
    this.bonusPieces = new Int32Array(prepared.bonuses.length)
    this.chosen = new Int32Array(prepared.kinds.length)
    const limit = Math.max(1, Math.floor(request.limit) || DEFAULT_RESULT_LIMIT)
    this.preferred = new TopK<Leaf>(limit)
    this.deprioritized = new TopK<Leaf>(limit)
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
      for (let level = 0; level < 3; level++) {
        this.armorSlots[level] = talisman.armorSlots[level]
        this.weaponSlots[level] = weapon.slotCounts[level] + talisman.weaponSlots[level]
      }
      // 무기 스킬은 방어구와 무관하므로 호석마다 한 번만 판정한다
      this.weaponResult = this.p.weaponPrecheck ? this.fill(this.p.weaponFill, NO_SLOTS, this.weaponSlots) : null
      if ((!this.p.weaponPrecheck || this.weaponResult) && this.feasible(0)) this.dfs(0)
      this.progress(1, 1, true)
    }
  }

  response(): SearchResponse {
    return {
      preferred: this.preferred.sorted().map((leaf) => this.materialize(leaf, 'p')),
      deprioritized: this.deprioritized.sorted().map((leaf) => this.materialize(leaf, 'd')),
      totalPreferred: this.totalPreferred,
      totalDeprioritized: this.totalDeprioritized,
      truncated: this.stopped,
      elapsedMs: performance.now() - this.started,
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
      this.apply(cls.pts, cls.bonus, cls.slotCounts, 1)
      this.chosen[depth] = ci
      if (this.feasible(depth + 1)) this.dfs(depth + 1)
      this.apply(cls.pts, cls.bonus, cls.slotCounts, -1)
      if ((++this.nodes & 1023) === 0) this.checkLimits()
      if (depth === 0) this.progress(ci + 1, kindClasses.length, false)
    }
  }

  private apply(pts: Int32Array, bonus: Uint8Array, slots: Readonly<SlotCounts>, sign: 1 | -1): void {
    for (let i = 0; i < pts.length; i++) this.points[i] += sign * pts[i]
    for (let j = 0; j < bonus.length; j++) this.bonusPieces[j] += sign * bonus[j]
    for (let level = 0; level < 3; level++) this.armorSlots[level] += sign * slots[level]
  }

  /** 남은 부위(depth 이후)를 최대로 가정해도 조건을 못 채우면 false (낙관적 상한만 사용) */
  private feasible(depth: number): boolean {
    const { required, bonuses, bounds } = this.p
    const remainingBonus = bounds.remainingBonus[depth]
    for (let j = 0; j < bonuses.length; j++) {
      if (this.bonusPieces[j] + remainingBonus[j] < bonuses[j].pieces) return false
    }
    const remainingPts = bounds.remainingPts[depth]
    for (const i of bounds.noneIndices) {
      if (this.points[i] + remainingPts[i] < required[i].need) return false
    }
    const slots = this.armorSlots
    for (const th of bounds.thresholds) {
      let deficit = 0
      for (const i of th.indices) {
        const d = required[i].need - this.points[i]
        if (d > 0) deficit += d
      }
      if (deficit === 0) continue
      const current = slots[0] * th.pot[0] + slots[1] * th.pot[1] + slots[2] * th.pot[2]
      if (deficit > current + th.remaining[depth]) return false
    }
    return true
  }

  private fill(fillers: Fillers, armor: Readonly<SlotCounts>, weapon: Readonly<SlotCounts>): FillResult | null {
    const { required } = this.p
    const deficits = fillers.indices.map((i) => Math.max(0, required[i].need - this.points[i]))
    return fillers.clean.fill(deficits, armor, weapon) ?? fillers.all?.fill(deficits, armor, weapon) ?? null
  }

  private leaf(): void {
    if (++this.leaves >= this.limits.maxLeaves) this.stopped = true
    const { classes, kinds, talismans, weapon, jointFill } = this.p

    let armorFill: FillResult | null
    let weaponFill: FillResult | null
    if (jointFill) {
      armorFill = this.fill(jointFill, this.armorSlots, this.weaponSlots)
      weaponFill = EMPTY_FILL
    } else {
      armorFill = this.fill(this.p.armorFill, this.armorSlots, NO_SLOTS)
      weaponFill = armorFill && (this.weaponResult ?? this.fill(this.p.weaponFill, NO_SLOTS, this.weaponSlots))
    }
    if (!armorFill || !weaponFill) return

    let defense = weapon.defense
    let unwanted =
      talismans[this.talismanIndex].unwanted.length > 0 || armorFill.unwanted.length > 0 || weaponFill.unwanted.length > 0
    for (let d = 0; d < kinds.length; d++) {
      const cls = classes[d][this.chosen[d]]
      defense += cls.defense
      if (cls.unwanted.length > 0) unwanted = true
    }
    const score = armorFill.score + weaponFill.score
    const bySlots = this.request.sort !== 'defense'
    const primary = bySlots ? score : defense
    const secondary = bySlots ? defense : score
    const seq = this.seq++
    const heap = unwanted ? this.deprioritized : this.preferred
    if (unwanted) this.totalDeprioritized++
    else this.totalPreferred++
    if (heap.accepts(primary, secondary, seq)) {
      heap.push({ primary, secondary, seq, talisman: this.talismanIndex, chosen: this.chosen.slice(), armorFill, weaponFill })
    }
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
    this.hooks.onProgress({ ratio: Math.min(1, ratio), found: this.totalPreferred + this.totalDeprioritized })
  }

  /** 상위 결과를 실제 장비·장식주 배치로 바꾸고 computeBuild 로 최종 값을 계산한다 */
  private materialize(leaf: Leaf, category: 'p' | 'd'): SearchResultItem {
    const { classes, kinds, talismans, weapon, customTalismans, excluded } = this.p
    const talisman = talismans[leaf.talisman]
    const build = emptyBuild()
    build.weapon = this.request.weapon.choice
    build.talisman = talisman.members[0]?.ref ?? null

    const armor = {} as Record<ArmorKind, number[]>
    const armorSlotLevels = {} as Record<ArmorKind, SlotLevel[]>
    let variantCount = 1
    kinds.forEach((kind, depth) => {
      const cls = classes[depth][leaf.chosen[depth]]
      const rep = cls.members[0]
      armor[kind] = cls.members.map((m) => m.id)
      armorSlotLevels[kind] = rep ? cls.slots : []
      variantCount *= Math.max(1, cls.members.length)
      build.armor[kind] = rep ? { id: rep.id, transcend: this.request.transcend && canTranscend(rep) } : null
    })

    // computeBuild 의 슬롯 순서(무기 → 방어구 5부위 → 호석)대로 실제 슬롯 목록을 만든다
    const concrete: ConcreteSlot[] = []
    weapon.slots.forEach((level, index) => concrete.push({ key: 'weapon', index, slot: { kind: 'weapon', level } }))
    for (const kind of ARMOR_KINDS) {
      armorSlotLevels[kind].forEach((level, index) => concrete.push({ key: kind, index, slot: { kind: 'armor', level } }))
    }
    talisman.slots.forEach((slot, index) => concrete.push({ key: 'talisman', index, slot }))
    const assigned = assignDecorations(concrete, [...leaf.armorFill.decos, ...leaf.weaponFill.decos])
    if (!assigned) throw new Error('장식주 배치에 실패했습니다 (검색 엔진 오류)')
    for (const key of EQUIP_KEYS) build.decorations[key] = []
    for (const slot of concrete) build.decorations[slot.key][slot.index] = assigned.get(slot)?.id ?? null

    const summary = computeBuild(this.db, build, customTalismans)
    return {
      id: `${category}${leaf.talisman}-${leaf.chosen.join('.')}`,
      armor,
      talismans: talisman.members.map((m) => m.ref),
      decorations: build.decorations,
      skillLevels: [...activeSkillLevels(summary)].map(([skillId, level]) => ({ skillId, level })),
      unwantedSkills: unwantedSkillsOf(summary, excluded),
      freeSlots: summary.freeSlots,
      defense: summary.defense.max,
      variantCount,
    }
  }
}
