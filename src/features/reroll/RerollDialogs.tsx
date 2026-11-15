import { useState } from 'react'
import { SelectBox } from '../../components/controls'
import { Dialog } from '../../components/Dialog'
import { SkillSelect } from '../../components/SkillSelect'
import { Button, Toggle } from '../../components/ui'
import {
  frequentSkills,
  GOGMA_ELEMENT_LABEL,
  GOGMA_ELEMENTS,
  weaponKey,
  weaponLabel,
  type GogmaRoll,
  type GogmaWeapon,
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
 * 스킬 재부여 칸 적기: 시리즈·그룹 스킬 (자주 적은 스킬은 단추 한 번). 이미 적은 칸이면 바꾸기·루트에서 빼기·지우기
 */
export function SkillCellDialog({
  target,
  rolls,
  onSave,
  onExclude,
  onDelete,
  onClose,
}: {
  target: (CellTarget & { entry?: GogmaRoll }) | null
  rolls: readonly GogmaRoll[]
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
  onSave,
  onExclude,
  onDelete,
  onClose,
}: {
  target: CellTarget & { entry?: GogmaRoll }
  rolls: readonly GogmaRoll[]
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

/** 표에 무기 열 더하기: 무기 종류(선택 상자)·속성(단추, 이미 있는 열은 표시) */
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
  const [weapon, setWeapon] = useState<GogmaWeapon>({ weaponKind: 'long-sword', element: 'fire' })
  const has = (w: GogmaWeapon) => columns.some((c) => weaponKey(c) === weaponKey(w))
  const exists = has(weapon)
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
          <Button variant="primary" disabled={exists} onClick={() => onAdd(weapon)}>
            {exists ? '이미 있는 열' : `${weaponLabel(weapon)} 더하기`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <SelectBox
          aria-label="무기 종류"
          value={weapon.weaponKind}
          onChange={(e) => setWeapon({ ...weapon, weaponKind: e.target.value as WeaponKind })}
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
                onClick={() => setWeapon({ ...weapon, element })}
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
        <p className="text-xs text-muted">줄 그은 속성은 이미 표에 있어요. 무기 종류·속성이 같으면 리롤 결과도 같아서 열 하나로 써요.</p>
      </div>
    </Dialog>
  )
}

/** 무기 열 머리를 눌렀을 때: 격화 전 표시(스킬 재부여만)·열 지우기 */
export function ColumnDialog({
  weapon,
  count,
  beforeGogma,
  onBeforeGogma,
  onRemove,
  onClose,
}: {
  weapon: GogmaWeapon | null
  /** 이 열의 기록 수 */
  count: number
  beforeGogma: boolean
  /** 없으면 격화 전 표시를 보이지 않는다 (복원 강화) */
  onBeforeGogma?: (before: boolean) => void
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
