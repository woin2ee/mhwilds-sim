import { useState, type FormEvent } from 'react'
import { SelectBox } from '../../components/controls'
import { Dialog } from '../../components/Dialog'
import { Button } from '../../components/ui'
import {
  buildWeaponKind,
  isWeaponKind,
  MEMO_MAX,
  NAME_MAX,
  newSavedBuild,
  weaponKindOf,
  type SavedBuild,
} from '../../core/savedBuilds'
import type { BuildState } from '../../core/types'
import { WEAPON_KIND_LABEL } from '../../data/labels'
import { WEAPON_KINDS, type WeaponKind } from '../../data/types'
import { requestPersistentStorage, usePersistentState } from '../../lib/storage'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'

const INPUT =
  'w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none'

const isWeaponKindOrNull = (v: unknown): v is WeaponKind | null => v === null || isWeaponKind(v)

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
  const { db, savedBuilds, setSavedBuilds } = useAppState()
  const toast = useToast()
  const source = sourceId ? savedBuilds.find((s) => s.id === sourceId) : undefined
  const [name, setName] = useState(source?.name ?? defaultName)
  const [memo, setMemo] = useState(source?.memo ?? '')
  // 무기 없는 세팅을 저장할 때 마지막으로 고른 무기 종류 (다음 저장의 처음 값).
  // 고를 때 바로 기억한다: 저장하면 창이 닫혀 이 폼이 사라지므로 그때 바꾼 값은 브라우저에 써지지 않는다
  const [lastKind, setLastKind] = usePersistentState<WeaponKind | null>(
    'save-weapon-kind:v1',
    null,
    isWeaponKindOrNull,
  )
  // 덮어쓸 세팅의 종류가 있으면 그것부터 (예: DB 무기를 직접 입력으로 바꿔 덮어쓰기)
  const [pickedKind, setPickedKind] = useState(() => (source && weaponKindOf(db, source)) ?? lastKind)
  const fixedKind = buildWeaponKind(db, build)
  const weaponKind = fixedKind ?? pickedKind
  const pickKind = (kind: WeaponKind | null) => {
    setPickedKind(kind)
    setLastKind(kind)
  }

  const saveNew = () => {
    const saved = newSavedBuild(build, name, memo, weaponKind)
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
      weaponKind: weaponKind ?? undefined,
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
      <InfoFields
        name={name}
        memo={memo}
        weaponKind={weaponKind}
        fixedKind={fixedKind !== null}
        onName={setName}
        onMemo={setMemo}
        onWeaponKind={pickKind}
      />
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
  const [name, setName] = useState(target.name)
  const [memo, setMemo] = useState(target.memo)
  const [pickedKind, setPickedKind] = useState(() => weaponKindOf(db, target))
  const fixedKind = buildWeaponKind(db, target.build)
  const weaponKind = fixedKind ?? pickedKind
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSavedBuilds((list) =>
      list.map((s) =>
        s.id === target.id
          ? {
              ...s,
              name: name.trim() || s.name,
              memo: memo.trim(),
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
      <InfoFields
        name={name}
        memo={memo}
        weaponKind={weaponKind}
        fixedKind={fixedKind !== null}
        onName={setName}
        onMemo={setMemo}
        onWeaponKind={setPickedKind}
      />
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

/** 이름·무기 종류·메모. fixedKind 면 세팅의 DB 무기로 정해진 종류라 고를 수 없다 */
function InfoFields({
  name,
  memo,
  weaponKind,
  fixedKind,
  onName,
  onMemo,
  onWeaponKind,
}: {
  name: string
  memo: string
  weaponKind: WeaponKind | null
  fixedKind: boolean
  onName: (name: string) => void
  onMemo: (memo: string) => void
  onWeaponKind: (kind: WeaponKind | null) => void
}) {
  return (
    <>
      <label className="block space-y-1 text-xs text-muted">
        <span>이름</span>
        <input
          data-autofocus
          required
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => onName(e.target.value)}
          className={INPUT}
        />
      </label>
      <WeaponKindField value={weaponKind} fixed={fixedKind} onChange={onWeaponKind} />
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
