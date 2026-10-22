import { SkillSelect } from './SkillSelect'
import { Button, LevelSelect } from './ui'
import { nameOf } from '../data/db'
import type { SkillKind, SkillPoint } from '../data/types'
import { useDb } from '../state/context'

/** 스킬 + 레벨 목록 편집 (직접 입력 무기, 내 호석). 이미 고른 스킬은 다시 고를 수 없다. */
export function SkillPointEditor({
  points,
  onChange,
  kinds,
  max,
  addPlaceholder,
}: {
  points: readonly SkillPoint[]
  onChange: (next: SkillPoint[]) => void
  /** 모듈 상수로 넘길 것 (SkillSelect 목록 캐시용) */
  kinds: readonly SkillKind[]
  max: number
  addPlaceholder: string
}) {
  const db = useDb()
  return (
    <div className="space-y-1.5">
      {points.map((point, index) => {
        const skill = db.skills.get(point.skillId)
        const name = skill ? nameOf(skill.name) : `#${point.skillId}`
        return (
          <div key={point.skillId} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
            <LevelSelect
              value={point.level}
              max={Math.max(skill?.maxLevel ?? 1, point.level)}
              onChange={(level) => onChange(points.map((p, i) => (i === index ? { ...p, level } : p)))}
              ariaLabel={`${name} 레벨`}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`${name} 삭제`}
              onClick={() => onChange(points.filter((_, i) => i !== index))}
            >
              삭제
            </Button>
          </div>
        )
      })}
      {points.length < max && (
        <SkillSelect
          value={null}
          kinds={kinds}
          hiddenIds={points.map((p) => p.skillId)}
          onChange={(skill) => skill && onChange([...points, { skillId: skill.id, level: 1 }])}
          placeholder={addPlaceholder}
          ariaLabel={addPlaceholder}
        />
      )}
    </div>
  )
}
