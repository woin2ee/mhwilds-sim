import { useMemo, useState, type ReactNode } from 'react'
import { Button, Panel, Segmented } from '../../components/ui'
import {
  bestRoute,
  compareWeapons,
  finishedEntries,
  isGogmaElement,
  putRestore,
  putRoll,
  setBeforeGogma,
  setExcluded,
  stepBack,
  stepForward,
  weaponKey,
  weaponLabel,
  type GogmaRoll,
  type GogmaWeapon,
  type RerollEntry,
  type RerollProgress,
} from '../../core/gogmaRolls'
import { isWeaponKind } from '../../core/savedBuilds'
import { skillName } from '../../data/format'
import { usePersistentState } from '../../lib/storage'
import { useDb } from '../../state/context'
import { useToast } from '../../state/toast'
import { isObject } from '../../state/storedValues'
import { BackupTabLink } from '../saved/BackupPage'
import { AddWeaponDialog, ColumnDialog, SkillCellDialog, type CellTarget } from './RerollDialogs'
import { RerollSheet } from './RerollSheet'
import { RouteView } from './RouteView'
import { useGogmaRestores, useGogmaRolls, useRerollProgress } from './useReroll'

/** 하위 탭과 기록 없이 더해 둔 무기 열 (기기마다 따로, 동기화하지 않는다 — 기록이 있는 무기는 늘 열로 보인다) */
const MODE_KEY = 'reroll-mode:v1'
const COLUMNS_KEY = 'reroll-columns:v1'

type Mode = keyof RerollProgress
type Columns = Record<Mode, GogmaWeapon[]>

const isWeapon = (v: unknown): v is GogmaWeapon => isObject(v) && isWeaponKind(v.weaponKind) && isGogmaElement(v.element)
const isWeaponList = (v: unknown): v is GogmaWeapon[] => Array.isArray(v) && v.every(isWeapon)
const isColumns = (v: unknown): v is Columns => isObject(v) && isWeaponList(v.skill) && isWeaponList(v.restore)
const isMode = (v: unknown): v is Mode => v === 'skill' || v === 'restore'

/**
 * 리롤 표 탭: 거극 아티어 스킬 재부여·복원 강화(옵션 초기화)를 하위 탭으로 나눠, 엑셀 시트처럼 줄은 번째·열은 무기인 표에
 * 잘 뜬 칸만 적으면 재료를 가장 아끼는(총 횟수가 가장 적은) 루트를 보여 주고 어디까지 했는지 기록한다 (DESIGN.md §7.6)
 */
export function RerollPage() {
  const [mode, setMode] = usePersistentState<Mode>(MODE_KEY, 'skill', isMode)
  return (
    <div className="mx-auto max-w-7xl space-y-4 break-keep">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented
          ariaLabel="리롤 종류"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'skill', label: '스킬 재부여' },
            { value: 'restore', label: '복원 강화' },
          ]}
        />
        <p className="min-w-0 flex-1 basis-80 text-xs leading-relaxed text-muted">
          리롤 횟수는 무기와 상관없이 하나로 이어지고 몇 번째에 무엇이 나오는지는 무기 종류·속성마다 정해져 있다고 알려져 있어요
          (스킬 재부여와 복원 강화는 따로). 저장한 곳에서 무기마다 돌려 보고 <span className="text-fg">잘 뜬 칸만</span> 표에 적으면
          재료를 가장 아끼는 순서를 알려 줘요. 기록은 <BackupTabLink /> 탭의 동기화·백업에도 담겨요.
        </p>
      </div>
      {mode === 'skill' ? <SkillReroll /> : <RestoreReroll />}
    </div>
  )
}

function SkillReroll() {
  const db = useDb()
  const toast = useToast()
  const [rolls, setRolls] = useGogmaRolls()
  const [target, setTarget] = useState<(CellTarget & { entry?: GogmaRoll }) | null>(null)
  const name = (id: number | null) => (id === null ? '—' : skillName(db, id))
  const close = () => setTarget(null)
  return (
    <RerollLayout
      mode="skill"
      verb="재부여"
      entries={rolls}
      setEntries={setRolls}
      renderCell={(r: GogmaRoll) => (
        <>
          <span className="block truncate">{r.setSkillId === null ? '—' : name(r.setSkillId)}</span>
          <span className="block truncate text-muted">{r.groupSkillId === null ? '—' : name(r.groupSkillId)}</span>
        </>
      )}
      cellLabel={(w, step, r) =>
        `${weaponLabel(w)} ${step}번째${r ? `: ${name(r.setSkillId)} · ${name(r.groupSkillId)}` : ' (비어 있음)'}`
      }
      onCellClick={(weapon, step, entry) => setTarget({ weapon, step, entry })}
      beforeGogma
      hint="칸을 누르면 그 무기의 그 번째에 뜬 시리즈·그룹 스킬을 적어요. 번째는 저장한 곳부터 세요 (다른 무기의 재부여·처음 격화도 한 번씩)."
      tips="넘기기는 루트에 없는 무기나 아직 차례가 오지 않은 무기의 재부여로 하세요. 이미 스킬을 띄운 무기를 다시 돌리면 스킬이 바뀌어요. 다른 무기를 처음 격화해도 한 번 넘어가니, 격화할 무기가 있으면 넘기기 칸에 격화해도 돼요."
    >
      <SkillCellDialog
        target={target}
        rolls={rolls}
        onSave={(t, setSkillId, groupSkillId) => {
          setRolls(putRoll(rolls, { ...t.weapon, step: t.step, setSkillId, groupSkillId }))
          toast(`${weaponLabel(t.weapon)} ${t.step}번째를 ${target?.entry ? '바꿨어요' : '적었어요'}`)
          close()
        }}
        onExclude={(entry) => {
          setRolls(setExcluded(rolls, entry.id, !entry.excluded))
          close()
        }}
        onDelete={(entry) => {
          setRolls(rolls.filter((r) => r.id !== entry.id))
          toast(`${weaponLabel(entry)} ${entry.step}번째를 지웠어요`)
          close()
        }}
        onClose={close}
      />
    </RerollLayout>
  )
}

function RestoreReroll() {
  const toast = useToast()
  const [rolls, setRolls] = useGogmaRestores()
  return (
    <RerollLayout
      mode="restore"
      verb="옵션 초기화"
      entries={rolls}
      setEntries={setRolls}
      renderCell={(r) => <span className="text-center text-sm">{r.done ? '✓' : '●'}</span>}
      cellLabel={(w, step, r) => `${weaponLabel(w)} ${step}번째${r ? ' (잘 뜸)' : ''}`}
      onCellClick={(weapon, step, entry) => {
        if (entry?.done) {
          toast("이미 띄운 칸이에요. '끝난 기록 지우기'로 정리하세요")
          return
        }
        setRolls(entry ? rolls.filter((r) => r.id !== entry.id) : putRestore(rolls, weapon, step))
      }}
      hint="칸을 누르면 잘 뜬 표시를 켜고, 다시 누르면 꺼요. 번째는 저장한 곳부터 세요 (다른 무기의 옵션 초기화도 한 번씩)."
      tips="넘기기는 루트에 없는 무기나 아직 차례가 오지 않은 무기의 옵션 초기화로 하세요. 이미 보너스를 띄운 무기를 다시 돌리면 보너스가 바뀌어요. '수치만 리롤'이 횟수에 들어가는지는 확인되지 않았으니 섞지 않는 편이 안전해요."
    />
  )
}

/** 하위 탭 공통: 데스크톱은 왼쪽에 표, 오른쪽에 루트(화면에 붙음). 휴대폰은 표 → 루트 순 */
function RerollLayout<T extends RerollEntry>({
  mode,
  verb,
  entries,
  setEntries,
  renderCell,
  cellLabel,
  onCellClick,
  beforeGogma = false,
  hint,
  tips,
  children,
}: {
  mode: Mode
  verb: string
  entries: T[]
  setEntries: (entries: T[]) => void
  renderCell: (entry: T) => ReactNode
  cellLabel: (weapon: GogmaWeapon, step: number, entry: T | undefined) => string
  onCellClick: (weapon: GogmaWeapon, step: number, entry: T | undefined) => void
  /** 열마다 '격화 전' 표시 (스킬 재부여만) */
  beforeGogma?: boolean
  hint: string
  tips: string
  /** 칸 입력 창 등 */
  children?: ReactNode
}) {
  const [allProgress, setAllProgress] = useRerollProgress()
  const [allColumns, setAllColumns] = usePersistentState<Columns>(COLUMNS_KEY, { skill: [], restore: [] }, isColumns)
  const [adding, setAdding] = useState(false)
  const [menu, setMenu] = useState<GogmaWeapon | null>(null)
  const progress = allProgress[mode]
  const route = useMemo(() => bestRoute(entries, progress), [entries, progress])
  const routeIds = useMemo(() => new Set(route.stops.map((r) => r.id)), [route])
  const finished = useMemo(() => finishedEntries(entries, progress), [entries, progress])

  // 열: 더해 둔 무기 + 기록이 있는 무기 (무기 종류·속성 순)
  const columns = useMemo(() => {
    const map = new Map<string, GogmaWeapon>()
    for (const w of [...allColumns[mode], ...entries]) map.set(weaponKey(w), { weaponKind: w.weaponKind, element: w.element })
    return [...map.values()].sort(compareWeapons)
  }, [allColumns, mode, entries])
  const setColumns = (list: GogmaWeapon[]) => setAllColumns((c) => ({ ...c, [mode]: list }))

  const move = (result: { list: T[]; progress: number }) => {
    setEntries(result.list)
    setAllProgress((p) => ({ ...p, [mode]: result.progress }))
  }
  const clearFinished = () => {
    if (!window.confirm(`끝난 기록 ${finished.length}개를 지울까요? 띄운 무기의 기록과 이미 지나간 번째의 기록이에요. 진행 횟수는 그대로예요.`)) {
      return
    }
    const ids = new Set(finished.map((r) => r.id))
    setEntries(entries.filter((r) => !ids.has(r.id)))
  }
  const clearAll = () => {
    if (!window.confirm(`${verb} 기록 ${entries.length}개와 진행을 모두 지울까요? 루트대로 돌리고 저장한 뒤 새로 적을 때 써요.`)) {
      return
    }
    move({ list: [], progress: 0 })
  }

  const menuEntries = menu ? entries.filter((r) => weaponKey(r) === weaponKey(menu)) : []
  const removeColumn = () => {
    if (!menu) return
    if (menuEntries.length > 0 && !window.confirm(`${weaponLabel(menu)} 열과 기록 ${menuEntries.length}개를 지울까요?`)) return
    setEntries(entries.filter((r) => weaponKey(r) !== weaponKey(menu)))
    setColumns(allColumns[mode].filter((w) => weaponKey(w) !== weaponKey(menu)))
    setMenu(null)
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      <Panel
        title={`표 · 기록 ${entries.length}개`}
        actions={
          (entries.length > 0 || progress > 0) && (
            <>
              {finished.length > 0 && (
                <Button size="sm" onClick={clearFinished}>
                  끝난 기록 {finished.length}개 지우기
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={clearAll} className="hover:text-bad">
                모두 지우기
              </Button>
            </>
          )
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">{hint}</p>
          {columns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
              돌려 볼 무기를 열로 더하세요. 무기 종류·속성마다 열 하나예요.
              <Button variant="primary" onClick={() => setAdding(true)}>
                + 무기 열 더하기
              </Button>
            </div>
          ) : (
            <RerollSheet
              columns={columns}
              entries={entries}
              routeIds={routeIds}
              progress={progress}
              renderCell={renderCell}
              cellLabel={cellLabel}
              onCellClick={onCellClick}
              onHeaderClick={setMenu}
              onAddColumn={() => setAdding(true)}
            />
          )}
        </div>
      </Panel>
      <Panel title="가장 짧은 루트" className="lg:sticky lg:top-20">
        <RouteView
          route={route}
          progress={progress}
          verb={verb}
          onForward={() => move(stepForward(entries, progress))}
          onBack={() => move(stepBack(entries, progress))}
          tips={tips}
        />
      </Panel>

      {children}
      <AddWeaponDialog
        open={adding}
        columns={columns}
        onAdd={(weapon) => {
          setColumns([...allColumns[mode], weapon])
          setAdding(false)
        }}
        onClose={() => setAdding(false)}
      />
      <ColumnDialog
        weapon={menu}
        count={menuEntries.length}
        beforeGogma={menuEntries[0]?.beforeGogma === true}
        onBeforeGogma={beforeGogma && menu ? (on) => setEntries(setBeforeGogma(entries, menu, on)) : undefined}
        onRemove={removeColumn}
        onClose={() => setMenu(null)}
      />
    </div>
  )
}
