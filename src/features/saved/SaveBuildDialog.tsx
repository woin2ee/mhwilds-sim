import { useState, type FormEvent } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button } from '../../components/ui'
import { MEMO_MAX, NAME_MAX, newSavedBuild, type SavedBuild } from '../../core/savedBuilds'
import type { BuildState } from '../../core/types'
import { requestPersistentStorage } from '../../lib/storage'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'

const INPUT =
  'w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none'

/** 세팅 저장. sourceId 의 내 세팅이 있으면 '덮어쓰기'도 고를 수 있다. */
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
  return (
    <Dialog open={open} onClose={onClose} title="내 세팅에 저장">
      <SaveForm build={build} defaultName={defaultName} sourceId={sourceId} onSaved={onSaved} onClose={onClose} />
    </Dialog>
  )
}

function SaveForm({
  build,
  defaultName,
  sourceId,
  onSaved,
  onClose,
}: {
  build: BuildState
  defaultName: string
  sourceId: string | null
  onSaved?: (saved: SavedBuild) => void
  onClose: () => void
}) {
  const { savedBuilds, setSavedBuilds } = useAppState()
  const toast = useToast()
  const source = sourceId ? savedBuilds.find((s) => s.id === sourceId) : undefined
  const [name, setName] = useState(source?.name ?? defaultName)
  const [memo, setMemo] = useState(source?.memo ?? '')

  const saveNew = () => {
    const saved = newSavedBuild(build, name, memo)
    setSavedBuilds((list) => [saved, ...list])
    void requestPersistentStorage()
    onSaved?.(saved)
    onClose()
    toast(`내 세팅에 저장했어요 · ${saved.name}`)
  }
  const overwrite = () => {
    if (!source) return
    const saved: SavedBuild = {
      ...source,
      name: name.trim() || source.name,
      memo: memo.trim(),
      build,
      updatedAt: new Date().toISOString(),
    }
    setSavedBuilds((list) => list.map((s) => (s.id === saved.id ? saved : s)))
    onSaved?.(saved)
    onClose()
    toast(`덮어썼어요 · ${saved.name}`)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (source) overwrite()
    else saveNew()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <NameMemoFields name={name} memo={memo} onName={setName} onMemo={setMemo} />
      {source && (
        <p className="text-xs text-muted">
          ‘{source.name}’에서 불러온 세팅이에요. 덮어쓰거나 새 세팅으로 저장할 수 있어요.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          취소
        </Button>
        {source ? (
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

/** 내 세팅의 이름·메모 수정 */
export function EditSavedDialog({ target, onClose }: { target: SavedBuild | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onClose={onClose} title="이름·메모 수정">
      {target && <EditForm target={target} onClose={onClose} />}
    </Dialog>
  )
}

function EditForm({ target, onClose }: { target: SavedBuild; onClose: () => void }) {
  const { setSavedBuilds } = useAppState()
  const [name, setName] = useState(target.name)
  const [memo, setMemo] = useState(target.memo)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSavedBuilds((list) =>
      list.map((s) =>
        s.id === target.id
          ? { ...s, name: name.trim() || s.name, memo: memo.trim(), updatedAt: new Date().toISOString() }
          : s,
      ),
    )
    onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <NameMemoFields name={name} memo={memo} onName={setName} onMemo={setMemo} />
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

function NameMemoFields({
  name,
  memo,
  onName,
  onMemo,
}: {
  name: string
  memo: string
  onName: (name: string) => void
  onMemo: (memo: string) => void
}) {
  return (
    <>
      <label className="block space-y-1 text-xs text-muted">
        <span>이름</span>
        <input
          autoFocus
          required
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => onName(e.target.value)}
          className={INPUT}
        />
      </label>
      <label className="block space-y-1 text-xs text-muted">
        <span>메모 (선택)</span>
        <textarea
          rows={3}
          maxLength={MEMO_MAX}
          value={memo}
          onChange={(e) => onMemo(e.target.value)}
          placeholder="예: 아르세베로 토벌용, 회피 장전 대신 연격"
          className={INPUT}
        />
      </label>
    </>
  )
}
