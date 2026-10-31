import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { SelectBox } from '../../components/controls'
import { Dialog } from '../../components/Dialog'
import { Button, Segmented } from '../../components/ui'
import { computeBuild, type BuildSummary } from '../../core/calc'
import {
  buildWeaponKind,
  isWeaponKind,
  MEMO_MAX,
  NAME_MAX,
  newSavedBuild,
  overwriteSavedBuild,
  weaponKindOf,
  type SavedBuild,
} from '../../core/savedBuilds'
import type { BuildState } from '../../core/types'
import type { GameDb } from '../../data/db'
import { skillName } from '../../data/format'
import { WEAPON_KIND_LABEL } from '../../data/labels'
import { WEAPON_KINDS, type WeaponKind } from '../../data/types'
import { cx } from '../../lib/cx'
import { useCoarsePointer } from '../../lib/media'
import { requestPersistentStorage, usePersistentState } from '../../lib/storage'
import { matchesQuery } from '../../lib/text'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
import { WeaponKindBadge, type KindKey } from './WeaponKindBadge'

const INPUT =
  'w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none'

const isWeaponKindOrNull = (v: unknown): v is WeaponKind | null => v === null || isWeaponKind(v)

/** 저장·정보 수정 창의 칸 */
interface SaveInfo {
  name: string
  memo: string
  /** 고른 무기 종류. 세팅에 DB 무기가 있으면 그 무기의 종류가 먼저다 */
  kind: WeaponKind | null
}

type SaveMode = 'new' | 'overwrite'
const SAVE_MODES: { value: SaveMode; label: string }[] = [
  { value: 'new', label: '새로 저장' },
  { value: 'overwrite', label: '덮어쓰기' },
]

/** 내 세팅이 이만큼 있으면 덮어쓸 세팅 목록 위에 이름·메모 검색 칸 */
const TARGET_SEARCH_MIN = 6

interface SaveFormProps {
  build: BuildState
  defaultName: string
  /** 새로 저장했거나 덮어쓴 세팅 */
  onSaved?: (saved: SavedBuild) => void
  onClose: () => void
}

/**
 * 세팅 저장. sourceId 의 내 세팅(수동 세팅에 불러온 세팅)이 있으면 그 세팅에 덮어쓰거나 새로 저장하고,
 * 없으면(검색 결과 등) 새로 저장하거나 '덮어쓰기'로 덮어쓸 내 세팅을 골라 덮어쓴다
 */
export function SaveBuildDialog({
  open,
  onClose,
  build,
  defaultName,
  sourceId = null,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  build: BuildState
  defaultName: string
  sourceId?: string | null
  /** 새로 저장했거나 덮어쓴 세팅 */
  onSaved?: (saved: SavedBuild) => void
}) {
  const { savedBuilds } = useAppState()
  const source = sourceId ? savedBuilds.find((s) => s.id === sourceId) : undefined
  const props = { build, defaultName, onSaved, onClose }
  return (
    <Dialog open={open} onClose={onClose} title="내 세팅에 저장">
      {source ? <SourceSaveForm {...props} source={source} /> : <PickSaveForm {...props} />}
    </Dialog>
  )
}

/** 새로 저장·덮어쓰기 (두 저장 창이 함께 쓴다) */
function useSaveActions({ build, onSaved, onClose }: SaveFormProps) {
  const { db, setSavedBuilds } = useAppState()
  const toast = useToast()
  // 무기 없는 세팅을 저장할 때 마지막으로 고른 무기 종류 (다음 저장의 처음 값).
  // 고를 때 바로 기억한다: 저장하면 창이 닫혀 이 폼이 사라지므로 그때 바꾼 값은 브라우저에 써지지 않는다
  const [lastKind, setLastKind] = usePersistentState<WeaponKind | null>(
    'save-weapon-kind:v1',
    null,
    isWeaponKindOrNull,
  )
  const fixedKind = buildWeaponKind(db, build)
  return {
    fixedKind,
    lastKind,
    setLastKind,
    /** 덮어쓸 세팅의 칸. 종류도 그 세팅 것부터 (예: DB 무기를 직접 입력으로 바꿔 덮어쓰기), 미지정이면 마지막으로 고른 종류 */
    infoOf: (saved: SavedBuild): SaveInfo => ({
      name: saved.name,
      memo: saved.memo,
      kind: weaponKindOf(db, saved) ?? lastKind,
    }),
    saveNew: (info: SaveInfo) => {
      const saved = newSavedBuild(build, info.name, info.memo, fixedKind ?? info.kind)
      setSavedBuilds((list) => [saved, ...list])
      void requestPersistentStorage()
      onSaved?.(saved)
      onClose()
      toast(`내 세팅에 저장했어요 · ${saved.name}`)
    },
    overwrite: (target: SavedBuild, info: SaveInfo) => {
      const saved = overwriteSavedBuild(target, build, info.name, info.memo, fixedKind ?? info.kind)
      setSavedBuilds((list) => list.map((s) => (s.id === saved.id ? saved : s)))
      onSaved?.(saved)
      onClose()
      toast(`덮어썼어요 · ${saved.name}`, {
        label: '되돌리기',
        onClick: () => setSavedBuilds((list) => list.map((s) => (s.id === target.id ? target : s))),
      })
    },
  }
}

/** 수동 세팅에 불러온 내 세팅에 덮어쓰기(엔터) 또는 새로 저장. 칸은 그 세팅 것으로 시작한다 */
function SourceSaveForm({ source, ...props }: SaveFormProps & { source: SavedBuild }) {
  const { fixedKind, setLastKind, infoOf, saveNew, overwrite } = useSaveActions(props)
  const [info, setInfo] = useState(() => infoOf(source))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    overwrite(source, info)
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <InfoFields value={info} fixedKind={fixedKind} onChange={setInfo} onPickKind={setLastKind} />
      <p className="text-xs text-muted">
        ‘{source.name}’에서 불러온 세팅이에요. 덮어쓰거나 새 세팅으로 저장할 수 있어요.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={props.onClose}>
          취소
        </Button>
        <Button onClick={() => saveNew(info)}>새로 저장</Button>
        <Button type="submit" variant="primary">
          덮어쓰기
        </Button>
      </div>
    </form>
  )
}

/**
 * 불러온 내 세팅이 없을 때(검색 결과, 직접 만든 수동 세팅): 새로 저장하거나, 내 세팅이 있으면 '덮어쓰기'로 덮어쓸 세팅을
 * 골라 덮어쓴다. 고르면 목록을 그 세팅 한 줄로 접고 칸을 그 세팅 것으로 채운다 (목록과 칸이 함께 있으면 창이 화면보다 길어진다).
 * 새로 저장할 칸은 따로 두어 오가도 남는다
 */
function PickSaveForm(props: SaveFormProps) {
  const { savedBuilds } = useAppState()
  const { fixedKind, lastKind, setLastKind, infoOf, saveNew, overwrite } = useSaveActions(props)
  const [mode, setMode] = useState<SaveMode>('new')
  const [draft, setDraft] = useState<SaveInfo>(() => ({ name: props.defaultName, memo: '', kind: lastKind }))
  /** 덮어쓸 세팅 id 와 그 세팅 것으로 채운 칸 */
  const [picked, setPicked] = useState<{ id: string; info: SaveInfo } | null>(null)
  /** 덮어쓸 세팅 목록을 펼쳐 고르는 중 */
  const [choosing, setChoosing] = useState(true)
  const target = picked ? savedBuilds.find((s) => s.id === picked.id) : undefined
  // 내 세팅이 없으면 덮어쓸 것도 없다 (덮어쓰기를 고른 뒤 다른 기기에서 모두 지운 경우 포함)
  const overwriting = mode === 'overwrite' && savedBuilds.length > 0
  // 고른 세팅이 지워지면 다시 고른다
  const listOpen = choosing || !target
  const formRef = useRef<HTMLFormElement>(null)
  const coarse = useCoarsePointer()
  /** 목록을 접고 펼 때 누른 버튼이 사라지므로 포커스를 옮긴다 (터치 기기는 키보드가 화면을 가리지 않게 옮기지 않는다) */
  const focusLater = (selector: string) => {
    if (!coarse) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(selector)?.focus())
  }
  const pick = (saved: SavedBuild) => {
    // 고른 세팅을 다시 고르면 고친 칸을 그대로 둔다
    if (saved.id !== picked?.id) setPicked({ id: saved.id, info: infoOf(saved) })
    setChoosing(false)
    focusLater('[data-autofocus]')
  }
  const openList = () => {
    setChoosing(true)
    focusLater('[aria-label="덮어쓸 세팅"] [aria-checked="true"]')
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!overwriting) saveNew(draft)
    else if (!listOpen && picked && target) overwrite(target, picked.info)
  }
  return (
    <form ref={formRef} onSubmit={submit} className="space-y-4">
      {savedBuilds.length > 0 && <Segmented value={mode} options={SAVE_MODES} onChange={setMode} ariaLabel="저장 방법" />}
      {overwriting ? (
        <>
          <TargetPicker selected={target} open={listOpen} onSelect={pick} onOpen={openList} />
          {!listOpen && picked && target && (
            <>
              <InfoFields
                value={picked.info}
                fixedKind={fixedKind}
                onChange={(info) => setPicked({ id: picked.id, info })}
                onPickKind={setLastKind}
              />
              <p className="text-xs text-muted">‘{target.name}’의 장비·장식주가 이 세팅으로 바뀌어요.</p>
            </>
          )}
        </>
      ) : (
        <InfoFields value={draft} fixedKind={fixedKind} onChange={setDraft} onPickKind={setLastKind} />
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={props.onClose}>
          취소
        </Button>
        <Button type="submit" variant="primary" disabled={overwriting && listOpen}>
          {overwriting ? '덮어쓰기' : '저장'}
        </Button>
      </div>
    </form>
  )
}

/** 발동 스킬 레벨 높은 순 몇 개와 나머지 수. 예: "약점 특효5 · 도전자5 · 회피 성능3 외 4개" */
function skillsText(db: GameDb, summary: BuildSummary, max = 3): string {
  const skills = summary.skills.filter((s) => s.level > 0)
  const text = skills
    .slice(0, max)
    .map((s) => `${skillName(db, s.skillId)}${s.level}`)
    .join(' · ')
  return skills.length > max ? `${text} 외 ${skills.length - max}개` : text || '발동 스킬 없음'
}

/** 덮어쓸 세팅 목록의 한 줄 */
interface TargetRow {
  saved: SavedBuild
  kind: KindKey
  /** 발동 스킬 몇 개 (이름이 비슷해도 알아보게) */
  skills: string
}

const ROW = 'block w-full rounded-md border px-2.5 py-1.5 text-left pointer-coarse:py-2'
const ROW_CHECKED = 'border-accent bg-accent/10'

/**
 * 덮어쓸 내 세팅 고르기. 펼치면 내 세팅 목록처럼 최근에 고친 순으로 줄마다 무기 종류와 발동 스킬, 많으면 이름·메모로 찾는다.
 * 고르면 그 세팅 한 줄로 접고 '다른 세팅 고르기'로 다시 편다
 */
function TargetPicker({
  selected,
  open,
  onSelect,
  onOpen,
}: {
  selected: SavedBuild | undefined
  /** 목록을 펼쳤는지 (접으면 고른 세팅 한 줄) */
  open: boolean
  onSelect: (saved: SavedBuild) => void
  onOpen: () => void
}) {
  const { db, customTalismans, savedBuilds } = useAppState()
  const rows = useMemo(
    () =>
      [...savedBuilds]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(
          (saved): TargetRow => ({
            saved,
            kind: weaponKindOf(db, saved) ?? 'none',
            skills: skillsText(db, computeBuild(db, saved.build, customTalismans)),
          }),
        ),
    [db, savedBuilds, customTalismans],
  )
  const selectedRow = selected && rows.find((r) => r.saved.id === selected.id)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">덮어쓸 세팅</span>
        {!open && (
          <Button size="sm" variant="ghost" onClick={onOpen}>
            다른 세팅 고르기
          </Button>
        )}
      </div>
      {open || !selectedRow ? (
        <TargetList rows={rows} selectedId={selected?.id ?? null} onSelect={onSelect} />
      ) : (
        <div className={cx(ROW, ROW_CHECKED)}>
          <TargetRowContent row={selectedRow} checked />
        </div>
      )}
    </div>
  )
}

/** 펼친 덮어쓸 세팅 목록. 따로 스크롤해서 아래 버튼이 밀려나지 않는다 */
function TargetList({
  rows,
  selectedId,
  onSelect,
}: {
  rows: readonly TargetRow[]
  selectedId: string | null
  onSelect: (saved: SavedBuild) => void
}) {
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  // 다시 펼치면 고른 세팅이 보이게
  useEffect(() => {
    listRef.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [])
  const shown = rows.filter(({ saved }) => matchesQuery(query, [saved.name, saved.memo]))
  return (
    <>
      {rows.length >= TARGET_SEARCH_MIN && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // 엔터(키보드의 '검색')로 폼이 제출되지 않게 막고 키보드만 내린다
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
          placeholder="이름·메모 검색"
          aria-label="덮어쓸 세팅 검색"
          className={INPUT}
        />
      )}
      <div ref={listRef} role="radiogroup" aria-label="덮어쓸 세팅" className="max-h-60 space-y-1.5 overflow-y-auto p-0.5">
        {shown.map((row) => {
          const checked = row.saved.id === selectedId
          return (
            <button
              key={row.saved.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onSelect(row.saved)}
              className={cx(ROW, checked ? ROW_CHECKED : 'border-line hover:bg-surface-2')}
            >
              <TargetRowContent row={row} checked={checked} />
            </button>
          )
        })}
        {shown.length === 0 && <p className="py-2 text-center text-xs text-muted">‘{query}’에 맞는 세팅이 없어요.</p>}
      </div>
    </>
  )
}

function TargetRowContent({ row, checked }: { row: TargetRow; checked: boolean }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <WeaponKindBadge kind={row.kind} />
        <span className={cx('truncate text-sm font-medium', checked && 'text-accent')}>{row.saved.name}</span>
      </span>
      <span className="mt-0.5 block truncate text-xs text-muted">{row.skills}</span>
    </>
  )
}

/** 내 세팅의 이름·무기 종류·메모 수정 */
export function EditSavedDialog({ target, onClose }: { target: SavedBuild | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onClose={onClose} title="세팅 정보 수정">
      {target && <EditForm target={target} onClose={onClose} />}
    </Dialog>
  )
}

function EditForm({ target, onClose }: { target: SavedBuild; onClose: () => void }) {
  const { db, setSavedBuilds } = useAppState()
  const [info, setInfo] = useState<SaveInfo>(() => ({
    name: target.name,
    memo: target.memo,
    kind: weaponKindOf(db, target),
  }))
  const fixedKind = buildWeaponKind(db, target.build)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const weaponKind = fixedKind ?? info.kind
    setSavedBuilds((list) =>
      list.map((s) =>
        s.id === target.id
          ? {
              ...s,
              name: info.name.trim() || s.name,
              memo: info.memo.trim(),
              weaponKind: weaponKind ?? undefined,
              updatedAt: new Date().toISOString(),
            }
          : s,
      ),
    )
    onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <InfoFields value={info} fixedKind={fixedKind} onChange={setInfo} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" variant="primary">
          저장
        </Button>
      </div>
    </form>
  )
}

/** 이름·무기 종류·메모. fixedKind 가 있으면 세팅의 DB 무기로 정해진 종류라 고를 수 없다 */
function InfoFields({
  value,
  fixedKind,
  onChange,
  onPickKind,
}: {
  value: SaveInfo
  fixedKind: WeaponKind | null
  onChange: (value: SaveInfo) => void
  /** 무기 종류를 골랐을 때 (저장 창은 다음 저장의 처음 값으로 기억한다) */
  onPickKind?: (kind: WeaponKind | null) => void
}) {
  return (
    <>
      <label className="block space-y-1 text-xs text-muted">
        <span>이름</span>
        <input
          data-autofocus
          required
          maxLength={NAME_MAX}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className={INPUT}
        />
      </label>
      <WeaponKindField
        value={fixedKind ?? value.kind}
        fixed={fixedKind !== null}
        onChange={(kind) => {
          onChange({ ...value, kind })
          onPickKind?.(kind)
        }}
      />
      <label className="block space-y-1 text-xs text-muted">
        <span>메모 (선택)</span>
        <textarea
          rows={3}
          maxLength={MEMO_MAX}
          value={value.memo}
          onChange={(e) => onChange({ ...value, memo: e.target.value })}
          placeholder="예: 아르세베로 토벌용, 회피 장전 대신 연격"
          className={INPUT}
        />
      </label>
    </>
  )
}

/** 무기 종류: 내 세팅 목록에 보이고 종류별로 거른다. DB 무기를 고른 세팅은 그 무기의 종류로 정해진다 */
function WeaponKindField({
  value,
  fixed,
  onChange,
}: {
  value: WeaponKind | null
  fixed: boolean
  onChange: (kind: WeaponKind | null) => void
}) {
  if (fixed && value) {
    return (
      <div className="space-y-1 text-xs text-muted">
        <span>무기 종류</span>
        <p className="text-sm text-fg">
          {WEAPON_KIND_LABEL[value]} <span className="text-xs text-muted">· 고른 무기의 종류</span>
        </p>
      </div>
    )
  }
  return (
    <label className="block space-y-1 text-xs text-muted">
      <span>무기 종류</span>
      <SelectBox
        value={value ?? ''}
        onChange={(e) => onChange(isWeaponKind(e.target.value) ? e.target.value : null)}
        className="w-full"
      >
        <option value="">미지정</option>
        {WEAPON_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {WEAPON_KIND_LABEL[kind]}
          </option>
        ))}
      </SelectBox>
      <span className="block">직접 입력 무기나 무기 없는 세팅은 종류를 여기서 골라요. 내 세팅 목록에 보여요.</span>
    </label>
  )
}
