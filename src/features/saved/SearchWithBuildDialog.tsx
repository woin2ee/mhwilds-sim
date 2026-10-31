import { useMemo } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button, Segmented } from '../../components/ui'
import type { SavedBuild } from '../../core/savedBuilds'
import type { GameDb } from '../../data/db'
import { skillName } from '../../data/format'
import type { SkillPoint } from '../../data/types'
import { cx } from '../../lib/cx'
import { usePersistentState } from '../../lib/storage'
import { useAppState } from '../../state/context'
import { normalizeConditions } from '../search/conditions'
import { useSearchPresets } from '../search/conditionsContext'
import {
  buildSkills,
  presetFromBuild,
  searchesWithWeapon,
  type PresetMode,
  type ReducedSkill,
} from '../search/fromBuild'
import { presetSummary, type SearchPreset } from '../search/presets'

/** 스킬 몇 개와 나머지 수. 예: "속성 변환3 · 쇄인자격2 외 4개" */
function pointsText(db: GameDb, points: readonly SkillPoint[], max = 3): string {
  const text = points
    .slice(0, max)
    .map((p) => `${skillName(db, p.skillId)}${p.level}`)
    .join(' · ')
  return points.length > max ? `${text} 외 ${points.length - max}개` : text
}

/** 무기가 달라 빠지거나 낮아진 스킬. 예: "공격3 · 쇄인룡의 굶주림2→1" */
function reducedText(db: GameDb, reduced: readonly ReducedSkill[], max = 3): string {
  const text = reduced
    .slice(0, max)
    .map((p) => `${skillName(db, p.skillId)}${p.level}${p.to > 0 ? `→${p.to}` : ''}`)
    .join(' · ')
  return reduced.length > max ? `${text} 외 ${reduced.length - max}개` : text
}

const isPresetMode = (v: unknown): v is PresetMode => v === 'add' || v === 'check'
const PRESET_MODES: { value: PresetMode; label: string }[] = [
  { value: 'add', label: '없는 스킬 더하기' },
  { value: 'check', label: '있는 스킬만 체크' },
]

/**
 * 저장한 조건이 있을 때 '검색 조건으로'를 누르면 고르는 창: 저장한 조건 불러오기(같은 무기로 찾는 조건을 위로) 또는 새 조건으로 시작.
 * 저장한 조건에는 없는 스킬을 더하거나 있는 스킬만 체크하고, 줄마다 더하거나 체크할 스킬과 무기에 맞춰 바뀌는 것을 미리 보여 준다
 */
export function SearchWithBuildDialog({
  target,
  onClose,
  onStartNew,
  onChoosePreset,
}: {
  target: SavedBuild | null
  onClose: () => void
  onStartNew: (saved: SavedBuild) => void
  onChoosePreset: (saved: SavedBuild, preset: SearchPreset, mode: PresetMode) => void
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
      {target && <PresetChoices saved={target} onChoose={(preset, mode) => onChoosePreset(target, preset, mode)} />}
    </Dialog>
  )
}

function PresetChoices({
  saved,
  onChoose,
}: {
  saved: SavedBuild
  onChoose: (preset: SearchPreset, mode: PresetMode) => void
}) {
  const { db, customTalismans } = useAppState()
  const { presets, active } = useSearchPresets()
  // 마지막으로 고른 방법으로 연다 (기기마다)
  const [mode, setMode] = usePersistentState<PresetMode>('search-with-build-mode:v1', 'add', isPresetMode)
  const skills = useMemo(() => buildSkills(db, saved.build, customTalismans), [db, saved.build, customTalismans])
  const rows = useMemo(() => {
    const list = presets.map((preset) => {
      const cond = normalizeConditions(preset.conditions)
      return {
        preset,
        sameWeapon: searchesWithWeapon(db, cond, saved.build.weapon),
        result: presetFromBuild(db, saved.build, customTalismans, cond, mode),
      }
    })
    // 같은 무기로 찾는 조건을 위로 (그 안에서는 저장한 순서)
    return [...list.filter((r) => r.sameWeapon), ...list.filter((r) => !r.sameWeapon)]
  }, [db, presets, saved.build, customTalismans, mode])

  return (
    <div className="space-y-3">
      <p className="text-sm break-keep">
        ‘{saved.name}’의 발동 스킬 {skills.length}개로 세팅 검색을 해요. 저장한 조건을 골라 불러오거나 새 조건으로 시작해요.
      </p>
      <section className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <h3 className="text-xs font-semibold text-muted">저장한 조건 불러오기</h3>
          <Segmented size="sm" value={mode} options={PRESET_MODES} onChange={setMode} ariaLabel="세팅의 스킬 넣는 방법" />
        </div>
        <ul className="space-y-1.5">
          {rows.map(({ preset, sameWeapon, result }) => (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => onChoose(preset, mode)}
                // 있는 스킬만 체크인데 세팅의 스킬이 하나도 없으면 체크할 것이 없다
                disabled={mode === 'check' && result.skills.length === 0}
                className={cx(
                  'w-full rounded-md border px-2.5 py-1.5 text-left hover:bg-surface-2 pointer-coarse:py-2',
                  'disabled:pointer-events-none disabled:opacity-50',
                  sameWeapon ? 'border-good/50' : 'border-line',
                )}
              >
                <span className="flex flex-wrap items-start gap-1.5">
                  <span className="min-w-0 text-sm font-medium break-keep wrap-anywhere">{preset.name}</span>
                  {sameWeapon && <ChoiceBadge className="border-good/50 text-good">같은 무기</ChoiceBadge>}
                  {preset.id === active?.id && <ChoiceBadge className="border-accent/50 text-accent">사용 중</ChoiceBadge>}
                </span>
                <span className="block truncate text-xs text-muted">{presetSummary(db, preset.conditions)}</span>
                {result.skills.length > 0 ? (
                  <span className="block truncate text-xs text-good">
                    {mode === 'add' ? '+' : '✓'} {pointsText(db, result.skills)}
                  </span>
                ) : (
                  <span className="block text-xs text-muted">
                    {mode === 'add' ? '세팅의 스킬이 모두 있어요' : '세팅의 스킬이 하나도 없어요'}
                  </span>
                )}
                {result.gogmaIds.length > 0 && (
                  <span className="block truncate text-xs text-good">
                    무기의 거극 아티어 스킬 → {result.gogmaIds.map((id) => skillName(db, id)).join(' · ')}
                  </span>
                )}
                {result.reduced.length > 0 && (
                  <span className="block truncate text-xs text-muted">
                    무기가 달라 빠지거나 낮아져요: {reducedText(db, result.reduced)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs break-keep text-muted">
          {mode === 'add' ? (
            <>
              고른 조건을 불러와 거기에 없는 스킬만 이 세팅의 레벨로 더해요. 이미 있는 스킬과 옵션은 그 조건 그대로고, 더한
              스킬은 그 조건에 바로 저장돼요.
            </>
          ) : (
            <>
              고른 조건을 불러와 원하는 스킬 중 이 세팅에 있는 스킬만 체크하고 나머지는 꺼요. 새 스킬은 더하지 않고, 레벨이
              세팅보다 높으면 세팅 레벨로 낮춰요. 바꾼 것은 그 조건에 바로 저장돼요.
            </>
          )}{' '}
          무기는 그 조건 것으로 찾아요: 같은 무기면 거극 아티어 스킬만 세팅대로 맞추고, 다른 무기면 세팅을 그 무기로 바꿔 낀
          것처럼 세요.
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
