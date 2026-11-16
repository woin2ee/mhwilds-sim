import { useState } from 'react'
import { SelectBox } from '../../components/controls'
import { Dialog } from '../../components/Dialog'
import { SkillSelect } from '../../components/SkillSelect'
import { Button, Toggle } from '../../components/ui'
import {
  frequentSkills,
  GOGMA_ELEMENT_LABEL,
  GOGMA_ELEMENTS,
  MAX_BONUS_LENGTH,
  MAX_STEP,
  normalizeBonus,
  weaponKey,
  weaponLabel,
  type GogmaRoll,
  type GogmaWeapon,
  type RestoreRoll,
} from '../../core/gogmaRolls'
import { skillName } from '../../data/format'
import { WEAPON_KIND_LABEL } from '../../data/labels'
import { WEAPON_KINDS, type SkillKind, type WeaponKind } from '../../data/types'
import { cx } from '../../lib/cx'
import { useDb } from '../../state/context'

/** 표에서 누른 칸 */
export interface CellTarget {
  weapon: GogmaWeapon
  step: number
}

/**
 * 스킬 재부여 칸 적기: 시리즈·그룹 스킬 (자주 적은 스킬은 단추 한 번). 이미 적은 칸이면 바꾸기·루트에서 빼기·지우기.
 * 그 무기를 이 번째까지 돌려 봤다고 표시할 수도 있다 (그 안의 빈칸은 안 뜬 칸)
 */
export function SkillCellDialog({
  target,
  rolls,
  checked,
  onChecked,
  onSave,
  onExclude,
  onDelete,
  onClose,
}: {
  target: (CellTarget & { entry?: GogmaRoll }) | null
  rolls: readonly GogmaRoll[]
  /** 이 무기를 돌려 본 번째 (0 이면 없음) */
  checked: number
  onChecked: (target: CellTarget) => void
  onSave: (target: CellTarget, setSkillId: number | null, groupSkillId: number | null) => void
  onExclude: (entry: GogmaRoll) => void
  onDelete: (entry: GogmaRoll) => void
  onClose: () => void
}) {
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={target ? `${weaponLabel(target.weapon)} ${target.step}번째` : ''}
      className="w-[min(28rem,calc(100vw-2rem))]"
    >
      {target && (
        <SkillCellForm
          target={target}
          rolls={rolls}
          checked={checked}
          onChecked={() => onChecked(target)}
          onSave={(set, group) => onSave(target, set, group)}
          onExclude={onExclude}
          onDelete={onDelete}
          onClose={onClose}
        />
      )}
    </Dialog>
  )
}

const SET_KINDS: readonly SkillKind[] = ['set']
const GROUP_KINDS: readonly SkillKind[] = ['group']

function SkillCellForm({
  target,
  rolls,
  checked,
  onChecked,
  onSave,
  onExclude,
  onDelete,
  onClose,
}: {
  target: CellTarget & { entry?: GogmaRoll }
  rolls: readonly GogmaRoll[]
  checked: number
  onChecked: () => void
  onSave: (setSkillId: number | null, groupSkillId: number | null) => void
  onExclude: (entry: GogmaRoll) => void
  onDelete: (entry: GogmaRoll) => void
  onClose: () => void
}) {
  const db = useDb()
  const { entry } = target
  const [setSkillId, setSet] = useState<number | null>(entry?.setSkillId ?? null)
  const [groupSkillId, setGroup] = useState<number | null>(entry?.groupSkillId ?? null)
  const ready = setSkillId !== null || groupSkillId !== null
  const name = (id: number) => skillName(db, id)

  return (
    <div className="space-y-4">
      <SkillField
        label="시리즈"
        kinds={SET_KINDS}
        value={setSkillId}
        frequent={frequentSkills(rolls, 'setSkillId')}
        onChange={setSet}
        name={name}
      />
      <SkillField
        label="그룹"
        kinds={GROUP_KINDS}
        value={groupSkillId}
        frequent={frequentSkills(rolls, 'groupSkillId')}
        onChange={setGroup}
        name={name}
      />
      <CheckedShortcut step={target.step} checked={checked} onChecked={onChecked} />
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {entry && (
          <>
            <Button size="sm" variant="ghost" onClick={() => onExclude(entry)}>
              {entry.excluded ? '루트에 다시 넣기' : '루트에서만 빼기'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(entry)} className="hover:text-bad">
              지우기
            </Button>
          </>
        )}
        <span className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" disabled={!ready} onClick={() => onSave(setSkillId, groupSkillId)}>
            {entry ? '바꾸기' : '적기'}
          </Button>
        </span>
      </div>
    </div>
  )
}

/** 스킬 선택 + 자주 적은 스킬 단추 (누르면 고르고, 고른 것을 다시 누르면 비운다) */
function SkillField({
  label,
  kinds,
  value,
  frequent,
  onChange,
  name,
}: {
  label: string
  kinds: readonly SkillKind[]
  value: number | null
  frequent: number[]
  onChange: (id: number | null) => void
  name: (id: number) => string
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-xs font-medium">{label}</span>
        <div className="min-w-0 flex-1">
          <SkillSelect
            value={value}
            kinds={kinds}
            placeholder={`${label} 스킬`}
            ariaLabel={`${label} 스킬`}
            onChange={(skill) => onChange(skill?.id ?? null)}
          />
        </div>
      </div>
      {frequent.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-12">
          {frequent.map((id) => (
            <Button
              key={id}
              size="sm"
              variant={id === value ? 'primary' : 'secondary'}
              aria-pressed={id === value}
              onClick={() => onChange(id === value ? null : id)}
            >
              {name(id)}
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}

/** 표에 무기 열 더하기: 무기 종류(선택 상자)·속성(단추, 이미 있는 열은 표시)·복원 보너스(선택, 같은 무기를 여러 자루 돌릴 때) */
export function AddWeaponDialog({
  open,
  columns,
  onAdd,
  onClose,
}: {
  open: boolean
  columns: readonly GogmaWeapon[]
  onAdd: (weapon: GogmaWeapon) => void
  onClose: () => void
}) {
  const [base, setWeapon] = useState<GogmaWeapon>({ weaponKind: 'long-sword', element: 'fire' })
  const [bonusText, setBonusText] = useState('')
  const bonus = normalizeBonus(bonusText)
  const weapon: GogmaWeapon = { weaponKind: base.weaponKind, element: base.element, ...(bonus ? { bonus } : {}) }
  const has = (w: GogmaWeapon) => columns.some((c) => weaponKey(c) === weaponKey(w))
  const exists = has(weapon)
  const add = () => {
    onAdd(weapon)
    setBonusText('')
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="무기 열 더하기"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" disabled={exists} onClick={add}>
            {exists ? '이미 있는 열' : `${weaponLabel(weapon)} 더하기`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <SelectBox
          aria-label="무기 종류"
          value={weapon.weaponKind}
          onChange={(e) => setWeapon({ ...base, weaponKind: e.target.value as WeaponKind })}
          data-autofocus
        >
          {WEAPON_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {WEAPON_KIND_LABEL[kind]}
            </option>
          ))}
        </SelectBox>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="속성">
          {GOGMA_ELEMENTS.map((element) => {
            const on = element === weapon.element
            const taken = has({ ...weapon, element })
            return (
              <button
                key={element}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setWeapon({ ...base, element })}
                className={cx(
                  'h-8 rounded-md border px-2.5 text-sm transition-colors pointer-coarse:h-10',
                  on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface-2 text-muted hover:text-fg',
                  taken && !on && 'line-through opacity-60',
                )}
              >
                {GOGMA_ELEMENT_LABEL[element]}
              </button>
            )
          })}
        </div>
        <BonusInput value={bonusText} onChange={setBonusText} onEnter={() => !exists && add()} />
        <p className="text-xs text-muted">
          줄 그은 속성은 이미 표에 있어요. 같은 무기 종류·속성을 두 자루 이상 돌리면 복원 보너스를 적어 열을 나눠요 (몇 번째에 무엇이
          나오는지는 같고, 자루마다 원하는 결과만 달라요).
        </p>
      </div>
    </Dialog>
  )
}

/** 복원 보너스 표기 입력 칸 (선택) */
function BonusInput({
  value,
  onChange,
  onEnter,
}: {
  value: string
  onChange: (text: string) => void
  onEnter: () => void
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm">
        복원 보너스 <span className="text-xs text-muted">(선택)</span>
      </span>
      <input
        type="text"
        value={value}
        maxLength={MAX_BONUS_LENGTH + 4}
        placeholder="예: 기기기기예, 속속속속예"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) onEnter()
        }}
        className="h-8 w-full rounded-md border border-line bg-surface px-2 text-sm pointer-coarse:h-10"
      />
    </label>
  )
}

/** 무기 열 머리를 눌렀을 때: 복원 보너스 표기·돌려 본 번째·격화 전 표시(스킬 재부여만)·열 지우기 */
export function ColumnDialog({
  weapon,
  columns,
  count,
  checked,
  onChecked,
  beforeGogma,
  onBeforeGogma,
  onRename,
  onRemove,
  onClose,
}: {
  weapon: GogmaWeapon | null
  /** 표의 모든 열 (복원 보너스를 바꿀 때 겹치는지 보려고) */
  columns: readonly GogmaWeapon[]
  /** 이 열의 기록 수 */
  count: number
  /** 돌려 본 번째 (0 이면 없음) */
  checked: number
  onChecked: (step: number) => void
  beforeGogma: boolean
  /** 없으면 격화 전 표시를 보이지 않는다 (복원 강화) */
  onBeforeGogma?: (before: boolean) => void
  /** 복원 보너스 표기를 바꾼 무기로 */
  onRename: (to: GogmaWeapon) => void
  onRemove: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      open={weapon !== null}
      onClose={onClose}
      title={weapon ? weaponLabel(weapon) : ''}
      className="w-[min(26rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="ghost" onClick={onRemove} className="mr-auto hover:text-bad">
            열 지우기{count > 0 && ` (기록 ${count}개)`}
          </Button>
          <Button onClick={onClose}>닫기</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-muted">기록 {count}개</p>
        {weapon && <BonusField key={`bonus:${weaponKey(weapon)}`} weapon={weapon} columns={columns} onRename={onRename} />}
        {weapon && <CheckedField key={`checked:${weaponKey(weapon)}`} value={checked} onChange={onChecked} />}
        {onBeforeGogma && (
          <Toggle
            checked={beforeGogma}
            disabled={count === 0}
            onChange={onBeforeGogma}
            label="아직 격화 전"
            description={
              count === 0
                ? '이 무기에 기록을 적은 뒤에 고를 수 있어요.'
                : '아직 거극으로 격화하지 않은 무기는 루트의 제 차례에 격화하면 재부여 없이 그 번째의 스킬을 받아요.'
            }
          />
        )}
      </div>
    </Dialog>
  )
}

/** 열의 복원 보너스 표기 바꾸기 (기록·돌려 본 번째도 함께 옮김). 같은 무기 종류·속성의 다른 열과 겹치면 막는다 */
function BonusField({
  weapon,
  columns,
  onRename,
}: {
  weapon: GogmaWeapon
  columns: readonly GogmaWeapon[]
  onRename: (to: GogmaWeapon) => void
}) {
  const [text, setText] = useState(weapon.bonus ?? '')
  const bonus = normalizeBonus(text)
  const to: GogmaWeapon = { weaponKind: weapon.weaponKind, element: weapon.element, ...(bonus ? { bonus } : {}) }
  const same = weaponKey(to) === weaponKey(weapon)
  const taken = !same && columns.some((c) => weaponKey(c) === weaponKey(to))
  const save = () => {
    if (same || taken) return
    onRename(to)
    setText(bonus ?? '')
  }
  return (
    <section className="space-y-1.5">
      <div className="flex items-end gap-1.5">
        <div className="min-w-0 flex-1">
          <BonusInput value={text} onChange={setText} onEnter={save} />
        </div>
        <Button size="sm" disabled={same || taken} onClick={save} className="pointer-coarse:h-10">
          바꾸기
        </Button>
      </div>
      <p className={cx('text-xs', taken ? 'text-bad' : 'text-muted')}>
        {taken
          ? `${weaponLabel(to)} 열이 이미 있어요.`
          : '같은 무기 종류·속성을 여러 자루 돌릴 때 열을 나눠요. 이 열의 기록과 돌려 본 번째는 그대로 옮겨요.'}
      </p>
    </section>
  )
}

/** 몇 번째까지 돌려 봤는지: 숫자 칸과 −·+ (비우거나 0 이면 지움) */
function CheckedField({ value, onChange }: { value: number; onChange: (step: number) => void }) {
  const [text, setText] = useState(value > 0 ? String(value) : '')
  const set = (n: number) => {
    const step = Math.min(MAX_STEP, Math.max(0, n))
    setText(step > 0 ? String(step) : '')
    onChange(step)
  }
  return (
    <section className="space-y-1.5">
      <span className="block font-medium">몇 번째까지 돌려 봤어요</span>
      <div className="flex items-center gap-1.5">
        <Button size="sm" aria-label="하나 줄이기" disabled={value === 0} onClick={() => set(value - 1)}>
          −
        </Button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_STEP}
          value={text}
          placeholder="—"
          aria-label="돌려 본 번째"
          onChange={(e) => {
            const raw = e.target.value
            setText(raw)
            const n = Number(raw)
            if (raw === '' || (Number.isInteger(n) && n >= 0 && n <= MAX_STEP)) onChange(raw === '' ? 0 : n)
          }}
          className="h-8 w-20 rounded-md border border-line bg-surface px-2 text-center tabular-nums pointer-coarse:h-10"
        />
        <Button size="sm" aria-label="하나 늘리기" onClick={() => set(value + 1)}>
          +
        </Button>
        <span>번째</span>
        {value > 0 && (
          <Button size="sm" variant="ghost" onClick={() => set(0)} className="ml-auto">
            지우기
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">
        그 안에서 적지 않은 칸은 안 뜬 칸(✕)으로 보여요. 다음에 이 무기를 돌려 볼 때 그 뒤부터 보면 돼요.
      </p>
    </section>
  )
}

/** 칸 창 안: 이 무기를 이 번째까지 돌려 봤다고 표시 (이미 그 뒤까지 봤으면 숨김) */
function CheckedShortcut({ step, checked, onChecked }: { step: number; checked: number; onChecked: () => void }) {
  if (checked >= step) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface-2/60 px-3 py-2">
      <Button size="sm" onClick={onChecked}>
        {step}번째까지 돌려 봤어요
      </Button>
      <span className="min-w-0 flex-1 basis-40 text-xs text-muted">
        {checked > 0 ? `지금은 ${checked}번째까지. ` : ''}그 안에서 적지 않은 칸은 안 뜬 칸(✕)으로 보여요.
      </span>
    </div>
  )
}

/**
 * 복원 강화 칸: '초기화'와 '재부여(수치만 변경)' 중 어느 쪽으로 떴는지 고르면 바로 적는다 (둘은 횟수 하나로 이어짐).
 * 적은 칸이면 다른 쪽으로 바꾸거나 지우고, 이 번째까지 돌려 봤다고 표시할 수도 있다
 */
export function RestoreCellDialog({
  target,
  checked,
  onPick,
  onDelete,
  onChecked,
  onClose,
}: {
  target: (CellTarget & { entry?: RestoreRoll }) | null
  /** 이 무기를 돌려 본 번째 (0 이면 없음) */
  checked: number
  onPick: (target: CellTarget, valuesOnly: boolean) => void
  onDelete: (entry: RestoreRoll) => void
  onChecked: (target: CellTarget) => void
  onClose: () => void
}) {
  const entry = target?.entry
  const kinds = [
    { valuesOnly: false, label: '초기화', note: '보너스를 새로 뽑기' },
    { valuesOnly: true, label: '수치 재부여', note: '수치만 변경' },
  ]
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={target ? `${weaponLabel(target.weapon)} ${target.step}번째` : ''}
      className="w-[min(26rem,calc(100vw-2rem))]"
    >
      {target && (
        <div className="space-y-4">
          <section className="space-y-1.5">
            <span className="block text-xs font-medium">어느 쪽으로 잘 떴어요?</span>
            <div className="grid grid-cols-2 gap-2">
              {kinds.map((kind) => {
                const on = entry !== undefined && (entry.valuesOnly === true) === kind.valuesOnly
                return (
                  <button
                    key={kind.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onPick(target, kind.valuesOnly)}
                    className={cx(
                      'flex flex-col items-center gap-0.5 rounded-md border px-3 py-3 text-sm font-medium transition-colors',
                      on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface-2 hover:border-accent',
                    )}
                  >
                    {kind.label}
                    <span className={cx('text-xs font-normal', on ? 'opacity-80' : 'text-muted')}>{kind.note}</span>
                  </button>
                )
              })}
            </div>
          </section>
          <CheckedShortcut step={target.step} checked={checked} onChecked={() => onChecked(target)} />
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {entry && (
              <Button size="sm" variant="ghost" onClick={() => onDelete(entry)} className="hover:text-bad">
                지우기
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} className="ml-auto">
              닫기
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
