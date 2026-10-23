import { Fragment, useMemo } from 'react'
import { SkillChip } from '../../components/SkillChip'
import { SlotList } from '../../components/SlotBadge'
import { computeBuild } from '../../core/calc'
import type { BuildState } from '../../core/types'
import { skillName } from '../../data/format'
import { ARMOR_KIND_LABEL, WEAPON_KIND_LABEL } from '../../data/labels'
import { ARMOR_KINDS } from '../../data/types'
import { useAppState } from '../../state/context'

/** 세팅 요약: 장비 이름, 발동 스킬, 방어력, 남은 슬롯 */
export function BuildPreview({ build, maxSkills }: { build: BuildState; maxSkills?: number }) {
  const { db, customTalismans } = useAppState()
  const summary = useMemo(() => computeBuild(db, build, customTalismans), [db, build, customTalismans])
  const weapon = build.weapon?.type === 'db' ? db.weapons.get(build.weapon.id) : undefined
  const rows: [label: string, name: string | undefined, note?: string][] = [
    ['무기', summary.equipment.weapon && (weapon ? `${WEAPON_KIND_LABEL[weapon.kind]} · ` : '') + summary.equipment.weapon.name],
    ...ARMOR_KINDS.map((kind): [string, string | undefined] => [ARMOR_KIND_LABEL[kind], summary.equipment[kind]?.name]),
    ['호석', summary.equipment.talisman?.name, build.talisman?.type === 'inline' ? '세팅 전용' : undefined],
  ]
  const skills = summary.skills.filter((s) => s.level > 0)
  const shown = maxSkills ? skills.slice(0, maxSkills) : skills
  const bonuses = summary.bonuses.filter((b) => b.level > 0)

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs sm:grid-cols-[2.5rem_minmax(0,1fr)_2.5rem_minmax(0,1fr)]">
        {rows.map(([label, name, note]) => (
          <Fragment key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="truncate" title={name}>
              {name ?? <span className="text-muted">—</span>}
              {note && <span className="text-muted"> · {note}</span>}
            </dd>
          </Fragment>
        ))}
      </dl>
      <div className="flex flex-wrap gap-1">
        {bonuses.map((b) => (
          <SkillChip key={b.skillId} tone="bonus" name={skillName(db, b.skillId)} level={b.level} />
        ))}
        {shown.map((s) => (
          <SkillChip key={s.skillId} name={skillName(db, s.skillId)} level={s.level} maxLevel={s.maxLevel} />
        ))}
        {skills.length > shown.length && (
          <span className="self-center text-xs text-muted">외 {skills.length - shown.length}개</span>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          방어력 <span className="font-semibold text-fg tabular-nums">{summary.defense.max}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          남은 슬롯 <SlotList slots={summary.freeSlots} size="sm" empty="없음" sorted />
        </span>
      </p>
    </div>
  )
}
