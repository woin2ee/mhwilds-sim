import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui'
import type { CustomTalisman, Slot, SlotKind, TalismanDraft } from '../../core/types'
import type { SkillKind, SlotLevel } from '../../data/types'
import { SelectBox, SlotLevelSelect } from '../../components/controls'
import { SkillPointEditor } from '../../components/SkillPointEditor'

const TALISMAN_SKILL_KINDS: SkillKind[] = ['armor', 'weapon']
const MAX_SKILLS = 3
const MAX_SLOTS = 3

/** 무기 슬롯 먼저, 같은 종류는 레벨 내림차순 (장식주 인덱스 기준이 되는 순서) */
function normalizeSlots(slots: readonly Slot[]): Slot[] {
  return [...slots].sort((a, b) => (a.kind === b.kind ? b.level - a.level : a.kind === 'weapon' ? -1 : 1))
}

export function TalismanForm({
  initial,
  defaultName,
  onSave,
  onCancel,
}: {
  initial?: CustomTalisman
  defaultName: string
  onSave: (draft: TalismanDraft) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [rarity, setRarity] = useState<number | null>(initial?.rarity ?? null)
  const [skills, setSkills] = useState(initial?.skills ?? [])
  const [slots, setSlots] = useState<Slot[]>(initial?.slots ?? [])
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (skills.length === 0 && slots.length === 0) {
      setError('스킬이나 슬롯을 하나 이상 입력하세요.')
      return
    }
    if (new Set(skills.map((s) => s.skillId)).size !== skills.length) {
      setError('같은 스킬을 두 번 넣을 수 없습니다.')
      return
    }
    onSave({ name: name.trim() || defaultName, rarity, skills, slots: normalizeSlots(slots) })
  }

  const updateSlot = (index: number, patch: Partial<Slot>) =>
    setSlots((list) => list.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)))

  return (
    <form onSubmit={submit} className="space-y-4 rounded-md border border-line bg-surface-2/40 p-3">
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted">
          이름
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={defaultName}
            maxLength={40}
            className="h-9 rounded-md border border-line bg-surface-2 px-2.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none pointer-coarse:h-10"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          레어도
          <SelectBox
            value={rarity ?? ''}
            onChange={(e) => setRarity(e.target.value === '' ? null : Number(e.target.value))}
            className="w-28"
          >
            <option value="">선택 안 함</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
              <option key={r} value={r}>
                레어도 {r}
              </option>
            ))}
          </SelectBox>
        </label>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-xs font-semibold text-muted">
          스킬 <span className="font-normal">(최대 {MAX_SKILLS}개)</span>
        </legend>
        <SkillPointEditor
          points={skills}
          kinds={TALISMAN_SKILL_KINDS}
          max={MAX_SKILLS}
          onChange={(next) => {
            setSkills(next)
            setError(null)
          }}
          addPlaceholder="스킬 추가 (방어구·무기 스킬)"
        />
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-xs font-semibold text-muted">
          슬롯 <span className="font-normal">(최대 {MAX_SLOTS}개)</span>
        </legend>
        {slots.map((slot, index) => (
          <div key={index} className="flex items-center gap-2">
            <SelectBox
              aria-label={`${index + 1}번 슬롯 종류`}
              value={slot.kind}
              onChange={(e) => updateSlot(index, { kind: e.target.value as SlotKind })}
              className="w-28"
            >
              <option value="armor">방어구 슬롯</option>
              <option value="weapon">무기 슬롯</option>
            </SelectBox>
            <SlotLevelSelect
              value={slot.level}
              onChange={(level) => updateSlot(index, { level: level as SlotLevel })}
              ariaLabel={`${index + 1}번 슬롯 레벨`}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`${index + 1}번 슬롯 삭제`}
              onClick={() => setSlots((list) => list.filter((_, i) => i !== index))}
            >
              삭제
            </Button>
          </div>
        ))}
        {slots.length < MAX_SLOTS && (
          <Button
            size="sm"
            onClick={() => {
              setSlots((list) => [...list, { kind: 'armor', level: 1 }])
              setError(null)
            }}
          >
            + 슬롯 추가
          </Button>
        )}
      </fieldset>

      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" variant="primary">
          저장
        </Button>
      </div>
    </form>
  )
}
