import { useMemo } from 'react'
import { SkillChip } from '../../components/SkillChip'
import { SkillSelect } from '../../components/SkillSelect'
import { Badge, Button, LevelSelect } from '../../components/ui'
import { nameOf } from '../../data/db'
import type { Skill, SkillKind, SkillPoint } from '../../data/types'
import { useDb } from '../../state/context'
import { bonusRankLabel } from './format'

const KIND_BADGE: Partial<Record<SkillKind, string>> = { weapon: '무기', set: '시리즈', group: '그룹' }
const UNWANTED_KINDS: readonly SkillKind[] = ['armor', 'weapon']

const isBonus = (skill: Skill) => skill.kind === 'set' || skill.kind === 'group'

function BonusLevelSelect({ skill, value, onChange }: { skill: Skill; value: number; onChange: (level: number) => void }) {
  return (
    <select
      aria-label={`${nameOf(skill.name)} 단계`}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 rounded-md border border-line bg-surface-2 px-1.5 text-sm"
    >
      {skill.ranks.map((rank) => (
        <option key={rank.level} value={rank.level} title={rank.name ? nameOf(rank.name) : undefined}>
          {bonusRankLabel(skill, rank.level)}
        </option>
      ))}
    </select>
  )
}

/** 원하는 스킬 + 레벨 목록 */
export function RequiredSkills({
  required,
  excluded,
  onChange,
}: {
  required: SkillPoint[]
  excluded: number[]
  onChange: (next: SkillPoint[]) => void
}) {
  const db = useDb()
  const hiddenIds = useMemo(() => [...required.map((r) => r.skillId), ...excluded], [required, excluded])
  const update = (skillId: number, level: number) =>
    onChange(required.map((r) => (r.skillId === skillId ? { skillId, level } : r)))

  return (
    <div className="space-y-2">
      {required.length === 0 ? (
        <p className="text-xs text-muted">찾고 싶은 스킬을 추가하세요. 레벨은 최소 요구 레벨이에요.</p>
      ) : (
        <ul className="space-y-1.5">
          {required.map((r) => {
            const skill = db.skills.get(r.skillId)
            if (!skill) return null
            return (
              <li key={r.skillId} className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm" title={skill.description}>
                  <span className="truncate">{nameOf(skill.name)}</span>
                  {KIND_BADGE[skill.kind] && <Badge>{KIND_BADGE[skill.kind]}</Badge>}
                </span>
                {isBonus(skill) ? (
                  <BonusLevelSelect skill={skill} value={r.level} onChange={(level) => update(r.skillId, level)} />
                ) : (
                  <LevelSelect
                    value={r.level}
                    max={skill.maxLevel}
                    onChange={(level) => update(r.skillId, level)}
                    ariaLabel={`${nameOf(skill.name)} 레벨`}
                  />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${nameOf(skill.name)} 제거`}
                  onClick={() => onChange(required.filter((x) => x.skillId !== r.skillId))}
                >
                  ×
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <SkillSelect
        value={null}
        onChange={(skill) => skill && onChange([...required, { skillId: skill.id, level: skill.maxLevel }])}
        hiddenIds={hiddenIds}
        placeholder="원하는 스킬 추가 (초성 검색 가능)"
        ariaLabel="원하는 스킬 추가"
      />
    </div>
  )
}

/** 비선호 스킬 목록 */
export function ExcludedSkills({
  excluded,
  required,
  onChange,
}: {
  excluded: number[]
  required: SkillPoint[]
  onChange: (next: number[]) => void
}) {
  const db = useDb()
  const hiddenIds = useMemo(() => [...required.map((r) => r.skillId), ...excluded], [required, excluded])
  return (
    <div className="space-y-2">
      {excluded.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {excluded.map((id) => {
            const skill = db.skills.get(id)
            if (!skill) return null
            return (
              <SkillChip
                key={id}
                name={nameOf(skill.name)}
                tone="unwanted"
                title={skill.description}
                onRemove={() => onChange(excluded.filter((x) => x !== id))}
              />
            )
          })}
        </div>
      )}
      <SkillSelect
        value={null}
        onChange={(skill) => skill && onChange([...excluded, skill.id])}
        kinds={UNWANTED_KINDS}
        hiddenIds={hiddenIds}
        placeholder="원하지 않는 스킬 추가"
        ariaLabel="비선호 스킬 추가"
      />
    </div>
  )
}
