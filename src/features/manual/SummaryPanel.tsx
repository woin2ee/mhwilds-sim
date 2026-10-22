import { useMemo } from 'react'
import { SlotList } from '../../components/SlotBadge'
import { Badge, EmptyState, Panel } from '../../components/ui'
import type { BonusTotal, BuildSummary, SkillTotal } from '../../core/calc'
import { nameOf } from '../../data/db'
import { signed, skillName } from '../../data/format'
import { ELEMENT_LABEL } from '../../data/labels'
import { ELEMENTS } from '../../data/types'
import { cx } from '../../lib/cx'
import { useDb } from '../../state/context'
import { LevelPips, SectionTitle } from '../../components/controls'
import { contributionLabel, EQUIP_LABEL } from './labels'

/** 수동 세팅 결과 요약: 발동 스킬, 시리즈/그룹 스킬, 방어력, 내성, 남은 슬롯 */
export function SummaryPanel({ summary }: { summary: BuildSummary }) {
  const db = useDb()
  const groups = useMemo(() => {
    const byName = (a: SkillTotal, b: SkillTotal) =>
      b.level - a.level || skillName(db, a.skillId).localeCompare(skillName(db, b.skillId), 'ko')
    const ofKind = (kind: 'armor' | 'weapon') =>
      summary.skills.filter((s) => db.skills.get(s.skillId)?.kind === kind).sort(byName)
    return [
      { title: '방어구 스킬', skills: ofKind('armor') },
      { title: '무기 스킬', skills: ofKind('weapon') },
    ]
  }, [db, summary])

  const invalid = summary.slots.filter((s) => !s.valid && s.decorationId !== null)
  const usedSlots = summary.slots.length - summary.freeSlots.length
  const isEmpty = Object.keys(summary.equipment).length === 0

  return (
    <Panel title="결과">
      {isEmpty ? (
        <EmptyState>장비를 고르면 발동 스킬과 방어력이 여기에 표시됩니다.</EmptyState>
      ) : (
        <div className="space-y-5">
          {invalid.length > 0 && (
            <ul className="space-y-0.5 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
              {invalid.map((s) => (
                <li key={`${s.key}-${s.index}`}>
                  {EQUIP_LABEL[s.key]} {s.index + 1}번 슬롯: 장식주가 슬롯에 맞지 않아 계산에서 빠졌습니다.
                </li>
              ))}
            </ul>
          )}

          {groups.map(
            (group) =>
              group.skills.length > 0 && (
                <section key={group.title}>
                  <SectionTitle aside={`${group.skills.length}개`}>{group.title}</SectionTitle>
                  <ul>
                    {group.skills.map((total) => (
                      <SkillRow key={total.skillId} total={total} />
                    ))}
                  </ul>
                </section>
              ),
          )}
          {summary.skills.length === 0 && <p className="text-sm text-muted">발동 중인 스킬이 없습니다.</p>}

          {summary.bonuses.length > 0 && (
            <section>
              <SectionTitle>시리즈 · 그룹 스킬</SectionTitle>
              <ul className="divide-y divide-line">
                {summary.bonuses.map((bonus) => (
                  <BonusRow key={bonus.skillId} bonus={bonus} />
                ))}
              </ul>
            </section>
          )}

          <section className="grid grid-cols-2 gap-3">
            <div>
              <SectionTitle>방어력</SectionTitle>
              <p className="text-2xl font-bold tabular-nums">{summary.defense.max}</p>
              <p className="text-xs text-muted">
                기본 {summary.defense.base} · 강화 최대 {summary.defense.max}
              </p>
            </div>
            <div className="min-w-0">
              <SectionTitle aside={`${usedSlots}/${summary.slots.length} 사용`}>남은 슬롯</SectionTitle>
              <div className="pt-1">
                <SlotList slots={summary.freeSlots} empty="없음" sorted />
              </div>
            </div>
          </section>

          <section>
            <SectionTitle>내성</SectionTitle>
            <div className="grid grid-cols-5 gap-1 text-center">
              {ELEMENTS.map((element) => {
                const value = summary.resistances[element]
                return (
                  <div key={element} className="rounded-md bg-surface-2 py-1.5">
                    <div className="text-[11px] text-muted">{ELEMENT_LABEL[element]}</div>
                    <div
                      className={cx(
                        'text-sm font-semibold tabular-nums',
                        value > 0 && 'text-good',
                        value < 0 && 'text-bad',
                      )}
                    >
                      {signed(value)}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </Panel>
  )
}

function SkillRow({ total }: { total: SkillTotal }) {
  const db = useDb()
  const skill = db.skills.get(total.skillId)
  const rank = skill?.ranks.find((r) => r.level === total.level)
  const overflow = total.rawLevel - total.maxLevel
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded px-1 py-1 hover:bg-surface-2 pointer-coarse:py-2 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 truncate text-sm">{skillName(db, total.skillId)}</span>
          {overflow > 0 && <span className="text-xs text-warn">+{overflow} 초과</span>}
          <LevelPips level={total.level} max={total.maxLevel} />
          <span className="w-12 text-right text-xs text-muted tabular-nums">
            Lv{total.level}
            <span className="opacity-60">/{total.maxLevel}</span>
          </span>
        </summary>
        <div className="mx-1 mt-0.5 mb-2 space-y-1 border-l-2 border-line pl-2 text-xs">
          {/* 레벨 효과만으로는 뜻이 안 통하는 스킬이 많아(예: 완충 'Lv1 스킬 효과 발동') 스킬 설명을 먼저 보여 준다 */}
          {skill?.description && <p>{skill.description}</p>}
          {rank?.description && rank.description !== skill?.description && (
            <p>
              <span className="text-muted">Lv{total.level}</span> {rank.description}
            </p>
          )}
          <ul className="text-muted">
            {total.contributions.map((c, i) => (
              <li key={i}>
                {contributionLabel(db, c)} <span className="tabular-nums">+{c.level}</span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </li>
  )
}

function BonusRow({ bonus }: { bonus: BonusTotal }) {
  const db = useDb()
  const skill = db.skills.get(bonus.skillId)
  const rank = bonus.level > 0 ? skill?.ranks.find((r) => r.level === bonus.level) : undefined
  const active = bonus.level > 0
  return (
    <li className="flex items-start justify-between gap-2 py-1.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm">
          <span className={cx('truncate', active ? 'text-accent' : 'text-muted')}>
            {skillName(db, bonus.skillId)}
          </span>
          <Badge>{bonus.kind === 'set' ? '시리즈' : '그룹'}</Badge>
        </div>
        <p className="text-xs text-muted" title={rank?.description}>
          {active ? (rank?.name ? nameOf(rank.name) : `${bonus.level}단계`) : '미발동'}
          {rank?.description && <span className="block text-fg/80">{rank.description}</span>}
        </p>
      </div>
      <div className="shrink-0 text-right text-xs text-muted tabular-nums">
        <div className={cx(active && 'text-fg')}>{bonus.pieces}부위</div>
        <div>{bonus.nextPieces !== null ? `다음 ${bonus.nextPieces}부위` : '최대 단계'}</div>
      </div>
    </li>
  )
}
