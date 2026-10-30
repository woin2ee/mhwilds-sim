import { useMemo } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button } from '../../components/ui'
import type { SavedBuild } from '../../core/savedBuilds'
import type { GameDb } from '../../data/db'
import { skillName } from '../../data/format'
import type { SkillPoint } from '../../data/types'
import { cx } from '../../lib/cx'
import { useAppState } from '../../state/context'
import { normalizeConditions } from '../search/conditions'
import { useSearchPresets } from '../search/conditionsContext'
import { addBuildSkills, buildSkills, searchesWithWeapon } from '../search/fromBuild'
import { presetSummary, type SearchPreset } from '../search/presets'

/** 스킬 몇 개와 나머지 수. 예: "속성 변환3 · 쇄인자격2 외 4개" */
function pointsText(db: GameDb, points: readonly SkillPoint[], max = 3): string {
  const text = points
    .slice(0, max)
    .map((p) => `${skillName(db, p.skillId)}${p.level}`)
    .join(' · ')
  return points.length > max ? `${text} 외 ${points.length - max}개` : text
}

/**
 * 저장한 조건이 있을 때 '검색 조건으로'를 누르면 고르는 창: 저장한 조건에 더하기(같은 무기로 찾는 조건을 위로) 또는 새 조건으로 시작.
 * 줄마다 더할 스킬을 미리 보여 준다
 */
export function SearchWithBuildDialog({
  target,
  onClose,
  onStartNew,
  onAddToPreset,
}: {
  target: SavedBuild | null
  onClose: () => void
  onStartNew: (saved: SavedBuild) => void
  onAddToPreset: (saved: SavedBuild, preset: SearchPreset) => void
}) {
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title="검색 조건으로"
      footer={
        target && (
          <>
            <Button variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button onClick={() => onStartNew(target)}>새 조건으로 시작</Button>
          </>
        )
      }
    >
      {target && <PresetChoices saved={target} onChoose={(preset) => onAddToPreset(target, preset)} />}
    </Dialog>
  )
}

function PresetChoices({ saved, onChoose }: { saved: SavedBuild; onChoose: (preset: SearchPreset) => void }) {
  const { db, customTalismans } = useAppState()
  const { presets, active } = useSearchPresets()
  const skills = useMemo(() => buildSkills(db, saved.build, customTalismans), [db, saved.build, customTalismans])
  const rows = useMemo(() => {
    const list = presets.map((preset) => {
      const cond = normalizeConditions(preset.conditions)
      return {
        preset,
        sameWeapon: searchesWithWeapon(db, cond, saved.build.weapon),
        added: addBuildSkills(db, skills, cond).added,
      }
    })
    // 같은 무기로 찾는 조건을 위로 (그 안에서는 저장한 순서)
    return [...list.filter((r) => r.sameWeapon), ...list.filter((r) => !r.sameWeapon)]
  }, [db, presets, saved.build.weapon, skills])

  return (
    <div className="space-y-3">
      <p className="text-sm break-keep">
        ‘{saved.name}’의 발동 스킬 {skills.length}개를 저장한 조건에 더하거나 새 조건으로 검색해요.
      </p>
      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold text-muted">저장한 조건에 더하기</h3>
        <ul className="space-y-1.5">
          {rows.map(({ preset, sameWeapon, added }) => (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => onChoose(preset)}
                className={cx(
                  'w-full rounded-md border px-2.5 py-1.5 text-left hover:bg-surface-2 pointer-coarse:py-2',
                  sameWeapon ? 'border-good/50' : 'border-line',
                )}
              >
                <span className="flex flex-wrap items-start gap-1.5">
                  <span className="min-w-0 text-sm font-medium break-keep wrap-anywhere">{preset.name}</span>
                  {sameWeapon && <ChoiceBadge className="border-good/50 text-good">같은 무기</ChoiceBadge>}
                  {preset.id === active?.id && <ChoiceBadge className="border-accent/50 text-accent">사용 중</ChoiceBadge>}
                </span>
                <span className="block truncate text-xs text-muted">{presetSummary(db, preset.conditions)}</span>
                {added.length > 0 ? (
                  <span className="block truncate text-xs text-good">+ {pointsText(db, added)}</span>
                ) : (
                  <span className="block text-xs text-muted">세팅의 스킬이 모두 있어요</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs break-keep text-muted">
          고른 조건을 불러와 거기에 없는 스킬만 이 세팅의 레벨로 더해요. 이미 있는 스킬과 무기·옵션은 그 조건 그대로고, 더한
          스킬은 그 조건에 바로 저장돼요.
        </p>
      </section>
      <p className="border-t border-line pt-3 text-xs break-keep text-muted">
        ‘새 조건으로 시작’은 저장한 조건과 연결하지 않고 원하는 스킬을 이 세팅의 스킬로, 무기를 이 세팅의 무기로 바꿔요.
      </p>
    </div>
  )
}

function ChoiceBadge({ className, children }: { className: string; children: string }) {
  return <span className={cx('shrink-0 rounded border px-1.5 py-px text-[11px]', className)}>{children}</span>
}
