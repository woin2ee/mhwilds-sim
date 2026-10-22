import { useMemo } from 'react'
import { LevelPips } from '../../components/controls'
import { EquipIcon } from '../../components/EquipIcon'
import { SlotBadge } from '../../components/SlotBadge'
import { Badge, Button } from '../../components/ui'
import type { BuildSummary, SlotUsage } from '../../core/calc'
import type { BuildState, EquipKey } from '../../core/types'
import { nameOf } from '../../data/db'
import { skillName } from '../../data/format'
import { WEAPON_KIND_LABEL } from '../../data/labels'
import { ARMOR_KINDS } from '../../data/types'
import { cx } from '../../lib/cx'
import { usePersistentState } from '../../lib/storage'
import { useDb } from '../../state/context'
import { EQUIP_LABEL } from './labels'

const EQUIP_KEYS: readonly EquipKey[] = ['weapon', ...ARMOR_KINDS, 'talisman']

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'

/**
 * 게임 위에 띄운 작은 창의 내용 (`src/lib/pip.ts` 창에 포털로 그린다).
 * 게임 안에서 만들고 끼울 것을 한눈에 보도록 부위별 장비·장식주와 발동 스킬만 보여 준다.
 */
export function GameOverlay({
  build,
  summary,
  name,
}: {
  build: BuildState
  summary: BuildSummary
  name: string | null
}) {
  const db = useDb()
  // 처음 띄웠을 때만 쓰는 법을 알려 준다
  const [showTip, setShowTip] = usePersistentState('overlay-tip:v1', true, isBoolean)
  const skills = useMemo(
    () =>
      summary.skills
        .filter((s) => s.level > 0)
        .sort((a, b) => b.level - a.level || skillName(db, a.skillId).localeCompare(skillName(db, b.skillId), 'ko')),
    [db, summary],
  )
  const bonuses = summary.bonuses.filter((b) => b.level > 0)
  const empty = Object.keys(summary.equipment).length === 0
  const weapon = build.weapon?.type === 'db' ? db.weapons.get(build.weapon.id) : undefined
  const equipName = (key: EquipKey) => {
    const equipment = summary.equipment[key]
    if (!equipment) return undefined
    return key === 'weapon' && weapon ? `${WEAPON_KIND_LABEL[weapon.kind]} · ${equipment.name}` : equipment.name
  }

  return (
    <div className="space-y-3 p-3 text-sm">
      {showTip && (
        <div className="space-y-1.5 rounded-md border border-accent/40 bg-accent/10 p-2.5 text-xs leading-relaxed">
          <p>이 창은 다른 창 위에 늘 떠 있어요. 위쪽을 끌어 옮기고, 모서리를 끌어 크기를 바꿀 수 있어요.</p>
          <p>
            게임 화면에서 이 창이 안 보이면 게임 옵션에서 화면 모드를 <strong>테두리 없는 창</strong>으로 바꿔 주세요.
          </p>
          <Button size="sm" variant="primary" onClick={() => setShowTip(false)}>
            알겠어요
          </Button>
        </div>
      )}

      <header className="flex items-baseline justify-between gap-2">
        <h1 className="min-w-0 truncate font-semibold">{name ?? '수동 세팅'}</h1>
        {!empty && (
          <span className="shrink-0 text-xs text-muted">
            방어력 <span className="font-semibold text-fg tabular-nums">{summary.defense.max}</span>
          </span>
        )}
      </header>

      {empty ? (
        <p className="text-muted">수동 세팅에서 장비를 고르면 여기에 바로 보여요.</p>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {EQUIP_KEYS.map((key) => (
              <EquipLine
                key={key}
                equip={key}
                name={equipName(key)}
                usages={summary.slots.filter((s) => s.key === key)}
              />
            ))}
          </ul>

          <section>
            <h2 className="mb-1 text-xs font-semibold text-muted">발동 스킬 {skills.length}개</h2>
            <ul className="space-y-0.5">
              {bonuses.map((bonus) => (
                <li key={bonus.skillId} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-accent">{skillName(db, bonus.skillId)}</span>
                  <Badge>{bonus.kind === 'set' ? '시리즈' : '그룹'}</Badge>
                  <span className="w-12 text-right text-xs text-muted tabular-nums">{bonus.level}단계</span>
                </li>
              ))}
              {skills.map((total) => (
                <li key={total.skillId} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{skillName(db, total.skillId)}</span>
                  <LevelPips level={total.level} max={total.maxLevel} />
                  <span className="w-12 text-right text-xs text-muted tabular-nums">
                    Lv{total.level}
                    <span className="opacity-60">/{total.maxLevel}</span>
                  </span>
                </li>
              ))}
            </ul>
            {skills.length === 0 && bonuses.length === 0 && <p className="text-muted">발동 중인 스킬이 없어요.</p>}
          </section>
        </>
      )}
    </div>
  )
}

/** 장비 한 줄 + 그 장비의 슬롯별 장식주 (빈 슬롯도 보여 준다) */
function EquipLine({ equip, name, usages }: { equip: EquipKey; name: string | undefined; usages: readonly SlotUsage[] }) {
  const db = useDb()
  return (
    <li className="px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <EquipIcon equip={equip} className="size-4 text-muted" />
        <span className="w-7 shrink-0 text-xs text-muted">{EQUIP_LABEL[equip]}</span>
        <span className={cx('min-w-0 flex-1 truncate', !name && 'text-muted')} title={name}>
          {name ?? '—'}
        </span>
      </div>
      {usages.length > 0 && (
        <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-14 text-xs">
          {usages.map((usage) => {
            const decoration = usage.decorationId !== null ? db.decorations.get(usage.decorationId) : undefined
            return (
              <li key={usage.index} className="flex min-w-0 items-center gap-1">
                <SlotBadge slot={usage.slot} filled={decoration !== undefined} size="sm" />
                {decoration ? (
                  <span
                    className={cx(!usage.valid && 'text-bad line-through')}
                    title={usage.valid ? undefined : '슬롯에 맞지 않아 계산에서 빠졌어요'}
                  >
                    {nameOf(decoration.name)}
                  </span>
                ) : (
                  <span className="text-muted">빈 슬롯</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}
