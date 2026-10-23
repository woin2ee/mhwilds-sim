// 수동 세팅의 '최대까지 채우기': 빈 슬롯에 장식주를 여러 개 넣어 스킬 하나를 최대 레벨까지 한 번에 올린다
import type { GameDb } from '../data/db'
import { setDecoration } from './buildUpdates'
import type { BuildSummary } from './calc'
import { canPlace } from './equipment'
import type { BuildState, EquipKey } from './types'

export interface DecorationPlacement {
  key: EquipKey
  index: number
  decorationId: number
}

export interface SkillFillPlan {
  skillId: number
  /** 채우기 전 레벨 */
  from: number
  /** 채운 뒤 레벨. 슬롯이 모자라면 maxLevel 보다 낮다 */
  to: number
  maxLevel: number
  /** 빈 슬롯에 넣을 장식주 (장비·슬롯 순서) */
  placements: DecorationPlacement[]
}

/** 배치 비용: [쓰는 슬롯 점수 Σ 레벨², 장식주 수, 장식주 크기 합]. 사전순으로 작을수록 좋다 */
type Cost = readonly [number, number, number]

interface Step {
  cost: Cost
  placement: DecorationPlacement | null
  prev: Step | null
}

function less(a: Cost, b: Cost): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]
  return false
}

/**
 * 빈 슬롯에 그 스킬 하나만 주는 장식주를 넣어 최대 레벨까지(슬롯이 모자라면 되는 데까지) 올리는 배치.
 * 한 레벨도 못 올리면 null. 장식주가 든 슬롯은 건드리지 않는다.
 * 같은 레벨에 닿는 배치가 여럿이면 큰 슬롯을 남기는 쪽(쓰는 슬롯의 Σ 레벨² 이 작은 것) → 장식주가 적은 것 → 작은 장식주.
 */
export function planSkillFill(db: GameDb, summary: BuildSummary, skillId: number): SkillFillPlan | null {
  const skill = db.skills.get(skillId)
  if (!skill) return null
  const from = summary.skills.find((s) => s.skillId === skillId)?.rawLevel ?? 0
  const need = skill.maxLevel - from
  if (need <= 0) return null
  // 복합 장식주는 다른 스킬까지 붙으므로 쓰지 않는다 (장식주가 있는 스킬은 모두 단일 스킬 장식주가 있다)
  const decorations = db.data.decorations
    .filter((d) => d.skills.length === 1 && d.skills[0].skillId === skillId)
    .sort((a, b) => a.size - b.size)
  const free = summary.slots.filter((s) => s.decorationId === null && decorations.some((d) => canPlace(d, s.slot)))

  // best[g] = 레벨을 g 만큼(need 에서 자름) 올리는 가장 좋은 배치. 슬롯마다 장식주 하나를 넣거나 비워 둔다 (0/1 배낭)
  let best: (Step | null)[] = Array.from({ length: need + 1 }, () => null)
  best[0] = { cost: [0, 0, 0], placement: null, prev: null }
  for (const usage of free) {
    const next = [...best]
    best.forEach((step, gained) => {
      if (!step) return
      for (const decoration of decorations) {
        if (!canPlace(decoration, usage.slot)) continue
        const g = Math.min(need, gained + decoration.skills[0].level)
        const cost: Cost = [step.cost[0] + usage.slot.level ** 2, step.cost[1] + 1, step.cost[2] + decoration.size]
        // 비용이 같으면 앞 슬롯을 쓰는 배치를 그대로 둔다
        if (!next[g] || less(cost, next[g].cost)) {
          next[g] = { cost, placement: { key: usage.key, index: usage.index, decorationId: decoration.id }, prev: step }
        }
      }
    })
    best = next
  }

  let gained = need
  while (gained > 0 && !best[gained]) gained--
  if (gained === 0) return null
  const placements: DecorationPlacement[] = []
  for (let step = best[gained]; step?.placement; step = step.prev) placements.unshift(step.placement)
  return { skillId, from, to: from + gained, maxLevel: skill.maxLevel, placements }
}

/** 계획대로 장식주를 넣는다. 그사이 장식주가 들어간 슬롯은 건너뛴다 */
export function applyFill(build: BuildState, plan: SkillFillPlan): BuildState {
  return plan.placements.reduce((b, p) => {
    const empty = (b.decorations[p.key]?.[p.index] ?? null) === null
    return empty ? setDecoration(b, p.key, p.index, p.decorationId) : b
  }, build)
}

/** applyFill 되돌리기: 넣은 장식주가 그대로 있는 슬롯만 비운다 */
export function undoFill(build: BuildState, plan: SkillFillPlan): BuildState {
  return plan.placements.reduce(
    (b, p) => (b.decorations[p.key]?.[p.index] === p.decorationId ? setDecoration(b, p.key, p.index, null) : b),
    build,
  )
}
