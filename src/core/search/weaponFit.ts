// 원하는 무기 스킬을 함께 띄울 수 있는지 판정한다 (세팅 검색 조건에서 함께 못 띄우는 무기 스킬을 켜지 못하게 막는 데 쓴다).
// 무기 스킬은 무기·호석·무기 장식주로만 얻어 방어구와 상관없으므로(DESIGN.md §4) 장식주 채우기(§6.4)로 정확히 판정한다.
// 무기 [3,3,3] 이면 명검-파룡주·집중-파룡주·속변-파룡주처럼 Lv1 쪽 스킬이 같은 3-1 장식주 셋으로 Lv3 스킬 넷까지 띄운다
import type { GameDb } from '../../data/db'
import type { SkillPoint, SlotLevel } from '../../data/types'
import { DecoFiller, fitsSizes, type FillDeco, type SizeCounts, type SlotCounts } from './decoFill'
import type { ExcludeMode } from './types'

/** 무기 스킬을 주는 장비 하나 (무기 또는 호석) */
export interface WeaponSkillSource {
  skills: readonly SkillPoint[]
  /** 무기 슬롯 레벨 (호석의 방어구 슬롯은 빼고) */
  weaponSlots: readonly SlotLevel[]
}

export interface WeaponFitInput {
  /** 판정할 무기 스킬. fits 에 넘기는 레벨이 이 순서다 */
  skillIds: readonly number[]
  /** 무기 후보: 무기를 정했으면 그 하나, 정하지 않았으면 고를 수 있는 무기 모두. 비면 무기 없음 */
  weapons: readonly WeaponSkillSource[]
  /** 호석 후보. 비면 호석 없음 */
  talismans: readonly WeaponSkillSource[]
  useDecorations: boolean
  /** 비선호 스킬. exclude 모드면 엔진처럼 이 스킬이 붙은 장식주·호석을 쓰지 않는다 (무기는 사용자가 고르므로 그대로) */
  excludedSkills: readonly number[]
  excludeMode: ExcludeMode
  /** 무기 장식주 여유분 [크기1, 크기2, 크기3]: 다 채우고 남는 무기 슬롯에 들어가야 한다 (§6.8) */
  spare: Readonly<SizeCounts>
}

/** 무기 + 호석 한 쌍이 주는 것: 판정할 스킬별 점수와 무기 슬롯 개수 */
interface Source {
  pts: number[]
  slots: SlotCounts
}

const NO_SLOTS: SlotCounts = [0, 0, 0]

const pointsOf = (skills: readonly SkillPoint[], skillId: number) => {
  let total = 0
  for (const s of skills) if (s.skillId === skillId) total += s.level
  return total
}

function countSlots(levels: readonly SlotLevel[]): SlotCounts {
  const counts: SlotCounts = [0, 0, 0]
  for (const level of levels) counts[level - 1]++
  return counts
}

/** a 로 b 가 채우는 것을 모두 채울 수 있는지: 스킬마다 점수가 같거나 크고, 레벨 k 이상 슬롯 수가 k 마다 같거나 많다 */
const covers = (a: Source, b: Source) => a.pts.every((p, i) => p >= b.pts[i]) && fitsSizes(a.slots, b.slots)

/** 다른 후보가 덮는 후보를 뺀다 (무기를 정하지 않으면 무기가 천 개가 넘는데, 판정할 스킬로 보면 대부분 [3,3,3] 무기가 덮는다) */
function pareto(list: readonly Source[]): Source[] {
  const kept: Source[] = []
  for (const source of list) {
    if (kept.some((k) => covers(k, source))) continue
    for (let i = kept.length - 1; i >= 0; i--) if (covers(source, kept[i])) kept.splice(i, 1)
    kept.push(source)
  }
  return kept
}

/** 방어구·방어구 장식주에서 얻는 스킬 (데이터마다 한 번) */
const armorSideCache = new WeakMap<GameDb, Set<number>>()
function armorSideSkills(db: GameDb): Set<number> {
  let ids = armorSideCache.get(db)
  if (!ids) {
    ids = new Set()
    for (const piece of db.data.armor) for (const p of piece.skills) ids.add(p.skillId)
    for (const d of db.data.decorations) if (d.kind === 'armor') for (const p of d.skills) ids.add(p.skillId)
    armorSideCache.set(db, ids)
  }
  return ids
}

export class WeaponSkillFit {
  private readonly maxLevels: number[]
  /** 방어구 쪽에서도 얻는 스킬: 무기 쪽만으로 따질 수 없어 늘 채운 것으로 본다 (지금 데이터엔 없다) */
  private readonly free: boolean[]
  private readonly sources: Source[]
  private readonly filler: DecoFiller

  constructor(db: GameDb, input: WeaponFitInput) {
    const ids = input.skillIds
    const armorSide = armorSideSkills(db)
    this.maxLevels = ids.map((id) => db.skills.get(id)?.maxLevel ?? 0)
    this.free = ids.map((id) => armorSide.has(id))
    const excluded = new Set(
      input.excludeMode === 'exclude' ? input.excludedSkills.filter((id) => !ids.includes(id)) : [],
    )
    const clean = (skills: readonly SkillPoint[]) => !skills.some((s) => excluded.has(s.skillId))
    const ptsOf = (skills: readonly SkillPoint[]) =>
      ids.map((id, i) => (this.free[i] ? 0 : Math.min(this.maxLevels[i], pointsOf(skills, id))))
    const sourceOf = (t: WeaponSkillSource): Source => ({ pts: ptsOf(t.skills), slots: countSlots(t.weaponSlots) })
    const none: Source = { pts: ids.map(() => 0), slots: NO_SLOTS }

    const weapons = input.weapons.length > 0 ? pareto(input.weapons.map(sourceOf)) : [none]
    // 엔진처럼 후보 호석이 없으면(비선호로 다 빠져도) 호석 없음 하나
    const usable = input.talismans.filter((t) => clean(t.skills))
    const talismans = usable.length > 0 ? pareto(usable.map(sourceOf)) : [none]
    this.sources = pareto(
      weapons.flatMap((w) =>
        talismans.map((t) => ({
          pts: w.pts.map((p, i) => p + t.pts[i]),
          slots: [w.slots[0] + t.slots[0], w.slots[1] + t.slots[1], w.slots[2] + t.slots[2]] as SlotCounts,
        })),
      ),
    )

    const decos: FillDeco[] = []
    if (input.useDecorations) {
      for (const decoration of db.data.decorations) {
        if (decoration.kind !== 'weapon' || !clean(decoration.skills)) continue
        const pts = ptsOf(decoration.skills)
        if (pts.every((p) => p === 0)) continue
        const levels = decoration.skills.reduce((sum, s) => sum + s.level, 0)
        const combo = decoration.skills.length > 1
        decos.push({ decoration, kind: 'weapon', size: decoration.size, pts, levels, combo, unwanted: [] })
      }
    }
    // 어떤 무기·호석에도 안 들어가는 여유분은 무기 스킬과 상관없이 결과가 없게 하므로 무기 스킬 판정에는 넣지 않는다
    const spare = this.sources.some((s) => fitsSizes(s.slots, input.spare)) ? input.spare : NO_SLOTS
    this.filler = new DecoFiller(decos, ids.length, [], { armor: [0, 0, 0], weapon: [spare[0], spare[1], spare[2]] })
  }

  /** levels[i] = skillIds[i] 의 요구 레벨 (0 = 요구하지 않음). 어떤 무기·호석 후보로든 무기 장식주까지 넣어 다 채울 수 있으면 true */
  fits(levels: readonly number[]): boolean {
    const need = levels.map((level, i) => (this.free[i] ? 0 : Math.min(level, this.maxLevels[i])))
    if (need.every((n) => n <= 0)) return true
    return this.sources.some(
      (s) => this.filler.fill(need.map((n, i) => Math.max(0, n - s.pts[i])), NO_SLOTS, s.slots) !== null,
    )
  }
}
