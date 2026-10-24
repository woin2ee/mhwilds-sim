import { useMemo, useState, type FormEvent } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button, Panel } from '../../components/ui'
import { NAME_MAX } from '../../core/savedBuilds'
import { cx } from '../../lib/cx'
import { requestPersistentStorage, usePersistentState } from '../../lib/storage'
import { useDb } from '../../state/context'
import { useToast } from '../../state/toast'
import type { SearchConditions } from './conditions'
import {
  conditionsKey,
  newPreset,
  overwritePreset,
  presetConditions,
  presetSummary,
  suggestPresetName,
  validPresets,
  type SearchPreset,
} from './presets'

const INPUT =
  'w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none'

// 항목 하나가 깨져도 목록 전체를 버리지 않게 배열인지만 보고, 항목은 validPresets 로 거른다
const isArray = (value: unknown): value is SearchPreset[] => Array.isArray(value)
const isActiveId = (value: unknown): value is string | null => value === null || typeof value === 'string'

type DialogState = { type: 'save' } | { type: 'rename'; preset: SearchPreset } | null

/**
 * 저장한 검색 조건 (조건 열 맨 위). 무기를 바꾸면 크게 바뀌는 조건을 이름을 붙여 두고, 누르면 그 조건으로 바꾼다.
 * 마지막으로 불러오거나 저장한 조건(activeId, '사용 중')은 고친 뒤 덮어쓸 수 있고, '해제'하면 지금 조건은 그대로 두고
 * 연결만 끊어 저장한 조건과 상관없이 고친다
 */
export function SearchPresets({ cond, onLoad }: { cond: SearchConditions; onLoad: (next: SearchConditions) => void }) {
  const db = useDb()
  const toast = useToast()
  const [stored, setStored] = usePersistentState<SearchPreset[]>('search-presets:v1', [], isArray)
  const presets = useMemo(() => validPresets(stored), [stored])
  const [activeId, setActiveId] = usePersistentState<string | null>('search-preset-active:v1', null, isActiveId)
  const [dialog, setDialog] = useState<DialogState>(null)
  const currentKey = useMemo(() => conditionsKey(cond), [cond])
  const active = presets.find((p) => p.id === activeId) ?? null

  const load = (preset: SearchPreset) => {
    const previous = cond
    const previousActive = activeId
    onLoad(presetConditions(preset, cond))
    setActiveId(preset.id)
    toast(`‘${preset.name}’ 조건을 불러왔어요`, {
      label: '되돌리기',
      onClick: () => {
        onLoad(previous)
        setActiveId(previousActive)
      },
    })
  }
  const saveNew = (name: string) => {
    const preset = newPreset(name, cond)
    setStored([preset, ...presets])
    setActiveId(preset.id)
    void requestPersistentStorage()
    toast(`조건을 저장했어요 · ${preset.name}`)
  }
  const overwrite = (target: SearchPreset, name: string) => {
    const preset = overwritePreset(target, cond, name)
    setStored(presets.map((p) => (p.id === preset.id ? preset : p)))
    setActiveId(preset.id)
    toast(`덮어썼어요 · ${preset.name}`)
  }
  const rename = (target: SearchPreset, name: string) => {
    const trimmed = name.trim().slice(0, NAME_MAX)
    if (trimmed) setStored(presets.map((p) => (p.id === target.id ? { ...p, name: trimmed } : p)))
  }
  const release = (target: SearchPreset) => {
    setActiveId(null)
    toast(`‘${target.name}’ 해제했어요 · 지금 조건은 그대로 남아요`)
  }
  const remove = (target: SearchPreset) => {
    if (!window.confirm(`‘${target.name}’ 조건을 삭제할까요?`)) return
    setStored(presets.filter((p) => p.id !== target.id))
    if (activeId === target.id) setActiveId(null)
    toast('삭제했어요')
  }

  return (
    <Panel
      title="저장한 조건"
      actions={
        <Button size="sm" onClick={() => setDialog({ type: 'save' })}>
          지금 조건 저장
        </Button>
      }
    >
      {presets.length === 0 ? (
        <p className="text-xs text-muted">
          무기마다 바뀌는 검색 조건(원하는 스킬·비선호·무기·호석·옵션)을 이름을 붙여 저장해 두고 불러올 수 있어요.
        </p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {presets.map((preset) => {
            // 표시는 연결된(사용 중인) 조건에만: 해제한 뒤에는 값이 같아도 '사용 중'으로 보이지 않는다
            const isActive = preset.id === activeId
            const modified = isActive && conditionsKey(preset.conditions) !== currentKey
            return (
              <li
                key={preset.id}
                className={cx(
                  'flex items-center gap-0.5 rounded-md border pr-0.5',
                  isActive ? 'border-accent/60' : 'border-line',
                )}
              >
                <button
                  type="button"
                  onClick={() => load(preset)}
                  title="눌러서 이 조건으로 바꾸기"
                  className="min-w-0 flex-1 rounded-l-md px-2.5 py-1.5 text-left hover:bg-surface-2 pointer-coarse:py-2"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{preset.name}</span>
                    {isActive && !modified && <StateBadge className="border-accent/50 text-accent">사용 중</StateBadge>}
                    {modified && <StateBadge className="border-warn/50 text-warn">수정됨</StateBadge>}
                  </span>
                  <span className="block truncate text-xs text-muted">{presetSummary(db, preset.conditions)}</span>
                </button>
                {isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${preset.name} 해제`}
                    title="저장한 조건과 연결을 끊어요. 지금 조건은 그대로 두고 자유롭게 고칠 수 있어요"
                    onClick={() => release(preset)}
                  >
                    해제
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`${preset.name} 이름 바꾸기`}
                  title="이름 바꾸기"
                  onClick={() => setDialog({ type: 'rename', preset })}
                >
                  <PencilIcon />
                </Button>
                <Button size="sm" variant="ghost" aria-label={`${preset.name} 삭제`} title="삭제" onClick={() => remove(preset)}>
                  ×
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={dialog?.type === 'save'} onClose={() => setDialog(null)} title="검색 조건 저장">
        <SaveForm
          defaultName={active?.name ?? suggestPresetName(db, cond)}
          active={active}
          onSaveNew={saveNew}
          onOverwrite={(name) => active && overwrite(active, name)}
          onClose={() => setDialog(null)}
        />
      </Dialog>
      <Dialog open={dialog?.type === 'rename'} onClose={() => setDialog(null)} title="조건 이름 바꾸기">
        {dialog?.type === 'rename' && (
          <RenameForm
            name={dialog.preset.name}
            onSubmit={(name) => rename(dialog.preset, name)}
            onClose={() => setDialog(null)}
          />
        )}
      </Dialog>
    </Panel>
  )
}

function StateBadge({ className, children }: { className: string; children: string }) {
  return <span className={cx('shrink-0 rounded border px-1.5 py-px text-[11px]', className)}>{children}</span>
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-3.5"
    >
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  )
}

function NameField({ name, onName }: { name: string; onName: (name: string) => void }) {
  return (
    <label className="block space-y-1 text-xs text-muted">
      <span>이름</span>
      <input
        data-autofocus
        required
        maxLength={NAME_MAX}
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder="예: 대검 회심 · 활 속성"
        className={INPUT}
      />
    </label>
  )
}

/** 새로 저장. 불러온 조건(active)이 있으면 '덮어쓰기'도 고를 수 있다 (내 세팅 저장과 같은 모양) */
function SaveForm({
  defaultName,
  active,
  onSaveNew,
  onOverwrite,
  onClose,
}: {
  defaultName: string
  active: SearchPreset | null
  onSaveNew: (name: string) => void
  onOverwrite: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(defaultName)
  const saveNew = () => {
    onSaveNew(name)
    onClose()
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (active) onOverwrite(name)
    else onSaveNew(name)
    onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <NameField name={name} onName={setName} />
      <p className="text-xs text-muted">
        {active
          ? `‘${active.name}’에서 불러온 조건이에요. 덮어쓰거나 새 조건으로 저장할 수 있어요.`
          : '원하는 스킬·비선호 스킬·무기·호석·옵션을 저장해요. 결과 정렬은 저장하지 않아요.'}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          취소
        </Button>
        {active ? (
          <>
            <Button onClick={saveNew}>새로 저장</Button>
            <Button type="submit" variant="primary">
              덮어쓰기
            </Button>
          </>
        ) : (
          <Button type="submit" variant="primary">
            저장
          </Button>
        )}
      </div>
    </form>
  )
}

function RenameForm({ name: initial, onSubmit, onClose }: { name: string; onSubmit: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(name)
    onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <NameField name={name} onName={setName} />
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
