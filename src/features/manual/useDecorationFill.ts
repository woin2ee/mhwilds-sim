import { useCallback, useMemo } from 'react'
import type { BuildSummary } from '../../core/calc'
import { applyFill, planSkillFill, undoFill, type SkillFillPlan } from '../../core/decorationFill'
import { nameOf, type GameDb } from '../../data/db'
import { skillName } from '../../data/format'
import type { Decoration } from '../../data/types'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'

/** 장식주 칸의 '최대까지 채우기'. ManualBuilder 가 만들어 DecorationSlots 로 넘긴다 */
export interface DecorationFill {
  /** 그 장식주의 스킬 중 빈 슬롯으로 더 올릴 수 있는 첫 스킬의 채우기 계획 (없으면 null) */
  planFor: (decoration: Decoration) => SkillFillPlan | null
  fill: (plan: SkillFillPlan) => void
}

export function useDecorationFill(summary: BuildSummary): DecorationFill {
  const { db, setManualBuild } = useAppState()
  const toast = useToast()
  // 장식주가 든 칸마다 그리면서 부른다. 슬롯 수십 개짜리 작은 계산이라 따로 담아 두지 않는다
  const planFor = useCallback(
    (decoration: Decoration) =>
      decoration.skills.map((p) => planSkillFill(db, summary, p.skillId)).find((plan) => plan !== null) ?? null,
    [db, summary],
  )
  const fill = useCallback(
    (plan: SkillFillPlan) => {
      setManualBuild((b) => applyFill(b, plan))
      toast(`${decorationsText(db, plan)}를 넣었어요 · ${resultText(db, plan)}`, {
        label: '되돌리기',
        onClick: () => setManualBuild((b) => undoFill(b, plan)),
      })
    },
    [db, setManualBuild, toast],
  )
  return useMemo(() => ({ planFor, fill }), [planFor, fill])
}

/** 넣을 장식주: '회피주【2】 3개' / '공격주Ⅲ【3】 1개, 공격주Ⅱ【2】 1개' */
export function decorationsText(db: GameDb, plan: SkillFillPlan): string {
  const counts = new Map<number, number>()
  for (const p of plan.placements) counts.set(p.decorationId, (counts.get(p.decorationId) ?? 0) + 1)
  return [...counts]
    .map(([id, count]) => {
      const decoration = db.decorations.get(id)
      return `${decoration ? nameOf(decoration.name) : '장식주'} ${count}개`
    })
    .join(', ')
}

/** 채운 뒤: '회피 성능 Lv5(최대)' / '회피 성능 Lv4/5 (빈 슬롯이 모자라요)' */
export function resultText(db: GameDb, plan: SkillFillPlan): string {
  const name = skillName(db, plan.skillId)
  return plan.to === plan.maxLevel
    ? `${name} Lv${plan.to}(최대)`
    : `${name} Lv${plan.to}/${plan.maxLevel} (빈 슬롯이 모자라요)`
}
