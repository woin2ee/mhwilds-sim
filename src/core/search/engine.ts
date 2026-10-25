// 스킬 검색 엔진 (DESIGN.md §6). 순수 동기 함수 — Web Worker(search.worker.ts)와 테스트에서 그대로 실행한다.
import type { GameDb } from '../../data/db'
import { ARMOR_KINDS, type ArmorKind, type SlotLevel } from '../../data/types'
import { activeSkillLevels, computeBuild, unwantedSkillsOf } from '../calc'
import { canTranscend } from '../transcend'
import { emptyBuild, EQUIP_KEYS } from '../types'
import { assignDecorations, type ConcreteSlot, type FillResult, type SlotCounts } from './decoFill'
import { bonusShortfall, prepare, type Fillers, type Prepared } from './prepare'
import { placeArmorDecorations } from './toBuild'
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

/** 찾은 조합 (상위 limit 개만 보관) */
interface Leaf extends Ranked {
  talisman: number
  /** 탐색 깊이(prepared.kinds 순서)별 클래스 인덱스 */
  chosen: Int32Array
  armorFill: FillResult
  weaponFill: FillResult
}

const NO_SLOTS: Readonly<SlotCounts> = [0, 0, 0]
const EMPTY_FILL: FillResult = { score: 0, decos: [], unwanted: [], short: 0 }

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
    this.relaxed = maxShortfall > 0
    this.bound = maxShortfall
    this.points = new Int32Array(prepared.required.length)
    this.bonusPieces = new Int32Array(prepared.bonuses.length)
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
      for (let level = 0; level < 3; level++) {
        this.armorSlots[level] = talisman.armorSlots[level]
        this.weaponSlots[level] = weapon.slotCounts[level] + talisman.weaponSlots[level]
      }
      // 무기 스킬은 방어구와 무관하므로 호석마다 한 번만 판정한다
      this.weaponResult = this.p.weaponPrecheck
        ? this.fill(this.p.weaponFill, NO_SLOTS, this.weaponSlots, this.bound)
        : null
      if ((!this.p.weaponPrecheck || this.weaponResult) && this.feasible(0)) this.dfs(0)
      this.progress(1, 1, true)
    }
  }

  response(): SearchResponse {
    return {
      items: this.results.sorted().map((leaf) => this.materialize(leaf)),
      total: this.total,
      truncated: this.stopped,
      elapsedMs: performance.now() - this.started,
      shortfall: this.relaxed && this.total > 0 ? this.bound : 0,
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

  /**
   * 남은 부위(depth 이후)를 최대로 가정해도 모자랄 수밖에 없는 레벨 합이 bound 를 넘으면 false (낙관적 상한만 사용).
   * 엄격 검색(bound 0)은 한 스킬이라도 모자라면 컷
   */
  private feasible(depth: number): boolean {
    const { required, bonuses, bounds } = this.p
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
    // 방어구 장식주로 채우는 스킬: 임계 레벨별 스킬 묶음이 서로 포함 관계(1 ⊇ 2 ⊇ 3)라 가장 큰 하한 하나만 더한다
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
      const lack = deficit - current - th.remaining[depth]
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
        if (deficit > slots[0] * th.pot[0] + slots[1] * th.pot[1] + slots[2] * th.pot[2] + th.remaining[depth]) return false
      }
    }
    return true
  }

  private fill(
    fillers: Fillers,
    armor: Readonly<SlotCounts>,
    weapon: Readonly<SlotCounts>,
    tolerance: number,
  ): FillResult | null {
    const { required } = this.p
    const deficits = fillers.indices.map((i) => Math.max(0, required[i].need - this.points[i]))
    const clean = fillers.clean.fill(deficits, armor, weapon, tolerance)
    if (!fillers.all || clean?.short === 0) return clean
    // 비선호 장식주는 그걸로 덜 모자랄 때만 쓴다
    const all = fillers.all.fill(deficits, armor, weapon, clean ? clean.short - 1 : tolerance)
    return all ?? clean
  }

  private leaf(): void {
    if (++this.leaves >= this.limits.maxLeaves) this.stopped = true
    const { classes, kinds, talismans, weapon, jointFill, required, bonuses, bounds } = this.p

    // 시리즈/그룹 스킬과 장식주로 못 채우는 스킬은 고른 부위만으로 정해진다
    let short = 0
    for (let j = 0; j < bonuses.length; j++) {
      if (this.bonusPieces[j] < bonuses[j].pieces) short += bonusShortfall(bonuses[j], this.bonusPieces[j])
    }
    for (const i of bounds.noneIndices) if (this.points[i] < required[i].need) short += required[i].need - this.points[i]
    let armorFill: FillResult | null
    let weaponFill: FillResult | null
    if (jointFill) {
      armorFill = this.fill(jointFill, this.armorSlots, this.weaponSlots, this.bound - short)
      weaponFill = EMPTY_FILL
    } else {
      // 방어구·무기 장식주는 따로 채우므로 각각 가장 적게 모자란 배치를 합치면 된다
      const weaponShort = this.weaponResult?.short ?? 0
      armorFill = this.fill(this.p.armorFill, this.armorSlots, NO_SLOTS, this.bound - short - weaponShort)
      weaponFill =
        armorFill &&
        (this.weaponResult ?? this.fill(this.p.weaponFill, NO_SLOTS, this.weaponSlots, this.bound - short - armorFill.short))
    }
    if (!armorFill || !weaponFill) return
    short += armorFill.short + weaponFill.short
    if (short < this.bound) {
      // 더 적게 모자란 조합을 찾았으면 지금까지 모은 결과는 버리고 이만큼 모자란 조합만 모은다
      this.bound = short
      this.results = this.newResults()
      this.total = 0
    }

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
    // 비선호 스킬이 든 결과도 같은 기준으로 섞고, 정렬 기준이 같을 때만 없는 쪽을 앞에 둔다
    const tertiary = unwanted ? 0 : 1
    const seq = this.seq++
    this.total++
    if (this.results.accepts(primary, secondary, tertiary, seq)) {
      this.results.push({
        primary,
        secondary,
        tertiary,
        seq,
        talisman: this.talismanIndex,
        chosen: this.chosen.slice(),
        armorFill,
        weaponFill,
      })
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
    this.hooks.onProgress({ ratio: Math.min(1, ratio), found: this.total, relaxed: this.relaxed })
  }

  /** 상위 결과를 실제 장비·장식주 배치로 바꾸고 computeBuild 로 최종 값을 계산한다 */
  private materialize(leaf: Leaf): SearchResultItem {
    const { classes, kinds, talismans, weapon, customTalismans, excluded } = this.p
    const talisman = talismans[leaf.talisman]
    const build = emptyBuild()
    build.weapon = this.request.weapon.choice
    build.talisman = talisman.members[0]?.ref ?? null

    const armorSlotLevels = {} as Record<ArmorKind, SlotLevel[]>
    kinds.forEach((kind, depth) => {
      const cls = classes[depth][leaf.chosen[depth]]
      const rep = cls.members[0]
      armorSlotLevels[kind] = rep ? cls.slots : []
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

    // 대체 후보: 같은 클래스(슬롯이 같음) + 슬롯이 적어도 그 부위 장식주가 다 들어가는 방어구 (부위마다 따로 바꿔도 된다)
    const armor = {} as Record<ArmorKind, number[]>
    let variantCount = 1
    kinds.forEach((kind, depth) => {
      const cls = classes[depth][leaf.chosen[depth]]
      const fewer = cls.fewerSlots.filter(
        (alt) => placeArmorDecorations(this.db, alt.slots, build.decorations[kind]) !== null,
      )
      armor[kind] = [...cls.members, ...fewer.map((alt) => alt.piece)].map((p) => p.id)
      variantCount *= Math.max(1, armor[kind].length)
    })

    const summary = computeBuild(this.db, build, customTalismans)
    return {
      id: `${leaf.talisman}-${leaf.chosen.join('.')}`,
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
