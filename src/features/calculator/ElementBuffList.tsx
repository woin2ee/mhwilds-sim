import { useState } from 'react'
import { Segmented } from '../../components/ui'
import {
  buffUnavailable,
  ELEMENT_BUFFS,
  type ElementBuff,
  type ElementBuffGroup,
  type ElementBuffId,
} from '../../core/elementCalc'
import { RESISTANCE_LABEL, WEAPON_KIND_LABEL } from '../../data/labels'
import type { Element, WeaponKind } from '../../data/types'
import { cx } from '../../lib/cx'
import { useDb } from '../../state/context'
import { BUFF_GROUP_LABEL, buffLevelLabel, buffName, effectText } from './elementText'

export interface BuffInputs {
  levels: Partial<Record<ElementBuffId, number>>
  resistances: Partial<Record<Element, number>>
  stages: Partial<Record<ElementBuffId, number>>
}

// ELEMENT_BUFFS 는 묶음 순서로 적혀 있다
const GROUPS: { group: ElementBuffGroup; buffs: ElementBuff[] }[] = []
for (const buff of ELEMENT_BUFFS) {
  const last = GROUPS.at(-1)
  if (last?.group === buff.group) last.buffs.push(buff)
  else GROUPS.push({ group: buff.group, buffs: [buff] })
}

/**
 * 속성치를 올리는 스킬·효과 목록 (무기 스킬 → 방어구 스킬 → 시리즈 스킬 → 함께 받는 효과). 줄마다 레벨(끔·Lv1 …)을 고르고
 * 고른 레벨의 효과를 옆에 보인다. 이 무기·속성에 효과가 없는 줄은 까닭과 함께 막아 두고, 고른 레벨은 그대로 둔다
 */
export function ElementBuffList({
  element,
  kind,
  inputs,
  onLevel,
  onResistance,
  onStage,
}: {
  element: Element
  kind: WeaponKind
  inputs: BuffInputs
  onLevel: (id: ElementBuffId, level: number) => void
  onResistance: (element: Element, value: number) => void
  onStage: (id: ElementBuffId, stage: number) => void
}) {
  const db = useDb()
  return (
    <div className="space-y-4">
      {GROUPS.map(({ group, buffs }) => (
        <section key={group}>
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted">{BUFF_GROUP_LABEL[group]}</h3>
          <ul className="divide-y divide-line">
            {buffs.map((buff) => {
              const unavailable = buffUnavailable(buff, element, kind)
              const level = Math.min(inputs.levels[buff.id] ?? 0, buff.maxLevel)
              const on = level > 0 && !unavailable
              const resistanceOf = buff.resistance?.(element)
              const resistance = resistanceOf ? (inputs.resistances[resistanceOf] ?? 0) : 0
              const stage = Math.min(Math.max(1, inputs.stages[buff.id] ?? 1), buff.maxStage ?? 1)
              const effect = on ? effectText(buff.effect(level, kind, { resistance, stage })) : ''
              const name = buffName(db, buff, element)
              const options = Array.from({ length: buff.maxLevel + 1 }, (_, l) => ({
                value: String(l),
                label: l === 0 ? '끔' : buffLevelLabel(db, buff, element, l),
              }))
              const extra = on && (resistanceOf !== undefined || buff.maxStage !== undefined)
              return (
                // 휴대폰은 이름 → 레벨 → (내성·단계) 순서로 쌓고, 넓으면 레벨을 오른쪽 열에 두고 내성·단계는 이름 아래에
                <li
                  key={buff.id}
                  className="grid grid-cols-1 gap-x-3 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className={cx('min-w-0', unavailable && 'opacity-50')}>
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted">
                      {unavailable ?? buff.condition(kind)}
                      {!unavailable && buff.byWeapon && ` · ${WEAPON_KIND_LABEL[kind]} 기준`}
                    </p>
                  </div>
                  <div className={cx('flex items-center gap-2 sm:col-start-2 sm:row-start-1', extra && 'sm:row-span-2')}>
                    {/* 효과 글이 바뀌어도 레벨 버튼이 움직이지 않게 폭을 잡아 둔다 */}
                    <span className="w-[4.5rem] text-xs font-medium text-good tabular-nums max-sm:order-last sm:text-right">
                      {effect}
                    </span>
                    <fieldset disabled={!!unavailable} className={cx(unavailable && 'opacity-50')}>
                      <Segmented
                        size="sm"
                        value={String(level)}
                        options={options}
                        onChange={(v) => onLevel(buff.id, Number(v))}
                        ariaLabel={`${name} 레벨`}
                      />
                    </fieldset>
                  </div>
                  {on && resistanceOf && (
                    <ResistanceInput
                      label={RESISTANCE_LABEL[resistanceOf]}
                      value={resistance}
                      onChange={(v) => onResistance(resistanceOf, v)}
                    />
                  )}
                  {on && buff.maxStage && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">쌓인 단계</span>
                      <Segmented
                        size="sm"
                        value={String(stage)}
                        options={Array.from({ length: buff.maxStage }, (_, i) => ({
                          value: String(i + 1),
                          label: `${i + 1}단계`,
                        }))}
                        onChange={(v) => onStage(buff.id, Number(v))}
                        ariaLabel={`${name} 쌓인 단계`}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** 내성 변환에 쓰는 내성 (장비 화면의 값). 고치는 동안은 친 글자를 그대로 둔다 */
function ResistanceInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={-50}
        max={100}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value)
          const next = Math.round(Number(e.target.value))
          if (e.target.value.trim() !== '' && Number.isFinite(next)) onChange(Math.min(100, Math.max(-50, next)))
        }}
        onBlur={() => setDraft(null)}
        className="h-8 w-20 rounded-md border border-line bg-surface-2 px-2 text-sm text-fg tabular-nums focus:border-accent focus:outline-none pointer-coarse:h-10"
      />
      <span className="text-xs text-muted">장비 화면의 값 (스킬·식사 효과 포함, 0 보다 낮으면 0)</span>
    </label>
  )
}
