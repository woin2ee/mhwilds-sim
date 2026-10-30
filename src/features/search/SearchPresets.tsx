import { useState, type FormEvent } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button, Panel, type PanelCollapse } from '../../components/ui'
import { NAME_MAX } from '../../core/savedBuilds'
import { cx } from '../../lib/cx'
import { requestPersistentStorage } from '../../lib/storage'
import { useDb } from '../../state/context'
import { useToast } from '../../state/toast'
import { useSearchConditions, useSearchPresets } from './conditionsContext'
import { ExportPresets, ImportPresets } from './PresetTransferDialogs'
import type { PresetImportResult } from './presetTransfer'
import { newPreset, presetConditions, presetSummary, suggestPresetName, type SearchPreset } from './presets'

const INPUT =
  'w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none'

type DialogState =
  | { type: 'save' }
  | { type: 'rename'; preset: SearchPreset }
  | { type: 'export' }
  | { type: 'import' }
  | null

/**
 * 저장한 검색 조건 (조건 열 맨 위). 무기를 바꾸면 크게 바뀌는 조건을 이름을 붙여 두고, 누르면 그 조건으로 바꾼다.
 * 마지막으로 불러오거나 저장한 조건('사용 중')은 고치는 대로 바로 저장되고(SearchConditionsProvider), '해제'하면 지금 조건은
 * 그대로 두고 연결만 끊어 저장한 조건을 바꾸지 않고 고친다. 사용 중인 조건이 없으면 목록 위에 눈에 띄게 알린다.
 * 아래 '내보내기'·'가져오기'로 다른 기기·친구와 코드나 파일로 주고받는다
 */
export function SearchPresets({
  collapse,
}: {
  /** 접기 (요약은 이 목록이 만든다: 사용 중인 조건 이름이나 선택한 조건 없음) */
  collapse?: PanelCollapse
}) {
  const db = useDb()
  const toast = useToast()
  const { cond, replace } = useSearchConditions()
  const { presets, setPresets, active, setActiveId } = useSearchPresets()
  const [dialog, setDialog] = useState<DialogState>(null)

  /** current: 불러오기 바로 전 조건 (가져오기에서 제외할 방어구를 더한 직후면 더한 조건) */
  const load = (preset: SearchPreset, current = cond) => {
    const previous = current
    const previousActive = active?.id ?? null
    replace(presetConditions(preset, current))
    setActiveId(preset.id)
    toast(`‘${preset.name}’ 조건을 불러왔어요`, {
      label: '되돌리기',
      onClick: () => {
        replace(previous)
        setActiveId(previousActive)
      },
    })
  }
  const saveNew = (name: string) => {
    const preset = newPreset(name, cond)
    setPresets([preset, ...presets])
    setActiveId(preset.id)
    void requestPersistentStorage()
    toast(`조건을 저장했어요 · 이제 고치면 ‘${preset.name}’에 바로 저장돼요`)
  }
  const rename = (target: SearchPreset, name: string) => {
    const trimmed = name.trim().slice(0, NAME_MAX)
    if (trimmed) setPresets(presets.map((p) => (p.id === target.id ? { ...p, name: trimmed } : p)))
  }
  const release = (target: SearchPreset) => {
    setActiveId(null)
    toast(`‘${target.name}’ 해제했어요 · 이제 고쳐도 이 조건은 그대로예요`)
  }
  const remove = (target: SearchPreset) => {
    if (!window.confirm(`‘${target.name}’ 조건을 삭제할까요?`)) return
    setPresets(presets.filter((p) => p.id !== target.id))
    if (active?.id === target.id) setActiveId(null)
    toast('삭제했어요')
  }
  const importDone = (result: PresetImportResult, withExcluded: boolean) => {
    // 제외할 방어구는 저장한 조건이 아니라 지금 조건의 제외 목록에 더한다
    const excluded = withExcluded && result.excludedArmor?.added ? result.excludedArmor : null
    const current = excluded ? { ...cond, excludedArmor: excluded.merged } : cond
    if (excluded) replace(current)
    if (result.added.length > 0) {
      setPresets(result.presets)
      void requestPersistentStorage()
    }
    setDialog(null)
    const [first] = result.added
    const count = result.added.length
    const presetsText = count === 1 ? `‘${first.name}’ 조건` : `조건 ${count}개`
    const excludedText = excluded && `제외할 방어구 ${excluded.added}개`
    const message = !excluded
      ? `${presetsText}${count === 1 ? '을' : '를'} 가져왔어요`
      : count === 0
        ? `${excludedText}를 가져왔어요`
        : `${presetsText}${count === 1 ? '과' : '와'} ${excludedText}를 가져왔어요`
    toast(message, count === 1 ? { label: '불러오기', onClick: () => load(first, current) } : undefined)
  }

  const summary = active ? (
    `사용 중 · ${active.name}`
  ) : presets.length > 0 ? (
    <>
      <span className="font-medium text-warn">선택한 조건 없음</span> · {presets.length}개
    </>
  ) : (
    '없음'
  )

  return (
    <Panel
      title="저장한 조건"
      collapse={collapse && { ...collapse, summary }}
      actions={
        <Button
          size="sm"
          title={active ? '사용 중인 조건은 그대로 두고, 지금 조건을 새 이름으로 하나 더 저장해요' : undefined}
          onClick={() => setDialog({ type: 'save' })}
        >
          {active ? '다른 이름으로 저장' : '지금 조건 저장'}
        </Button>
      }
    >
      {presets.length > 0 && <PresetStatus active={active} />}
      {presets.length === 0 ? (
        <p className="text-xs text-muted">
          무기마다 바뀌는 검색 조건(원하는 스킬·비선호·장식주 여유분·무기·호석·옵션)을 이름을 붙여 저장해 두고 불러올 수 있어요.
          불러온 조건은 고치는 대로 바로 저장돼요.
        </p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {presets.map((preset) => {
            // 표시는 연결된(사용 중인) 조건에만: 해제한 뒤에는 값이 같아도 '사용 중'으로 보이지 않는다
            const isActive = preset.id === active?.id
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
                  {/* 이름은 길면 줄을 바꿔 다 보여 준다. 띄어쓰기 없이 긴 이름만 아무 데서나 끊는다 */}
                  <span className="flex items-start gap-1.5">
                    <span className="min-w-0 text-sm font-medium break-keep wrap-anywhere">{preset.name}</span>
                    {isActive && <StateBadge className="border-accent/50 text-accent">사용 중</StateBadge>}
                  </span>
                  <span className="block truncate text-xs text-muted">{presetSummary(db, preset.conditions)}</span>
                </button>
                {isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${preset.name} 해제`}
                    title="연결을 끊어요. 지금 조건은 그대로 두고, 고쳐도 이 조건에는 저장되지 않아요"
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
      <div className="mt-3 flex justify-end gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          disabled={presets.length === 0 && cond.required.length === 0 && cond.excludedArmor.length === 0}
          title="저장한 조건을 코드나 파일로 내보내요 (다른 기기·친구에게)"
          onClick={() => setDialog({ type: 'export' })}
        >
          내보내기
        </Button>
        <Button
          size="sm"
          variant="ghost"
          title="내보낸 검색 조건 코드나 파일을 저장한 조건에 더해요"
          onClick={() => setDialog({ type: 'import' })}
        >
          가져오기
        </Button>
      </div>

      <Dialog
        open={dialog?.type === 'save'}
        onClose={() => setDialog(null)}
        title={active ? '다른 이름으로 저장' : '검색 조건 저장'}
      >
        <SaveForm
          defaultName={suggestPresetName(db, cond)}
          active={active}
          onSave={saveNew}
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
      <Dialog open={dialog?.type === 'export'} onClose={() => setDialog(null)} title="검색 조건 내보내기">
        <ExportPresets presets={presets} cond={cond} />
      </Dialog>
      <Dialog open={dialog?.type === 'import'} onClose={() => setDialog(null)} title="검색 조건 가져오기">
        <ImportPresets presets={presets} excludedArmor={cond.excludedArmor} onImport={importDone} />
      </Dialog>
    </Panel>
  )
}

/**
 * 목록 위 지금 상태 (자동 저장이라 어느 조건에 저장되는지 늘 보여야 한다). 사용 중인 조건이 없으면 고쳐도 저장한 조건에
 * 들어가지 않으니 노란 칸으로 눈에 띄게 알린다. 사용 중일 때는 조용한 한 줄 (밝은 테마의 주황 accent 와 노랑 warn 이
 * 거의 같아서 칸 색만으로는 두 상태가 구분되지 않는다)
 */
function PresetStatus({ active }: { active: SearchPreset | null }) {
  return active ? (
    <p className="mb-2.5 flex items-start gap-1.5 text-xs break-keep wrap-anywhere text-muted">
      <span aria-hidden className="text-good">
        ✓
      </span>
      <span>
        <span className="font-semibold text-fg">‘{active.name}’ 사용 중</span> · 고치면 바로 저장돼요
      </span>
    </p>
  ) : (
    <p className="mb-2.5 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs break-keep text-warn">
      <span className="font-semibold">선택한 조건 없음</span> · 고쳐도 저장한 조건에는 반영되지 않아요. 남겨 두려면
      ‘지금 조건 저장’을 눌러 주세요.
    </p>
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

/**
 * 지금 조건을 새 조건으로 저장하고 사용 중으로 둔다. 사용 중인 조건(active)은 고칠 때마다 이미 저장돼 있어서
 * 덮어쓰기 없이 '다른 이름으로 저장'만 한다
 */
function SaveForm({
  defaultName,
  active,
  onSave,
  onClose,
}: {
  defaultName: string
  active: SearchPreset | null
  onSave: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(defaultName)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSave(name)
    onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <NameField name={name} onName={setName} />
      <p className="text-xs text-muted">
        {active
          ? `‘${active.name}’에는 고친 내용이 이미 저장돼 있어요. 지금 조건을 새 이름으로 하나 더 저장하고, 이제부터는 새 조건에 저장해요.`
          : '원하는 스킬·비선호 스킬·장식주 여유분·무기·호석·옵션을 저장해요. 결과 정렬은 저장하지 않아요. 저장한 뒤에는 고치는 대로 바로 저장돼요.'}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
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
