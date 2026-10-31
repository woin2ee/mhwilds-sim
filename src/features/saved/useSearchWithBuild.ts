import type { SavedBuild } from '../../core/savedBuilds'
import type { GameDb } from '../../data/db'
import { skillName } from '../../data/format'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
import { useSearchConditions, useSearchPresets } from '../search/conditionsContext'
import { conditionsFromBuild, presetFromBuild, type PresetFromBuild, type PresetMode } from '../search/fromBuild'
import { presetConditions, type SearchPreset } from '../search/presets'

const namesText = (db: GameDb, ids: readonly number[]) => ids.map((id) => skillName(db, id)).join('·')

/** 알림 끝에 붙는 '비선호 스킬(체술·앙심)은 뺐어요' */
function skippedText(db: GameDb, skippedIds: readonly number[]): string {
  return skippedIds.length > 0 ? ` · 비선호 스킬(${namesText(db, skippedIds)})은 뺐어요` : ''
}

/** 알림에 붙는 무기 이야기: 같은 무기라 거극 아티어 스킬을 세팅대로 맞췄거나, 다른 무기라 세팅의 스킬을 그 무기로 다시 셌을 때 */
function weaponText(db: GameDb, { gogmaIds, reduced }: Pick<PresetFromBuild, 'gogmaIds' | 'reduced'>): string {
  const gogma = gogmaIds.length > 0 ? ` · 무기의 거극 아티어 스킬을 세팅대로 맞췄어요(${namesText(db, gogmaIds)})` : ''
  return gogma + (reduced.length > 0 ? ` · 무기가 달라 무기에 달린 스킬 ${reduced.length}개는 빼거나 낮춰 셌어요` : '')
}

/**
 * 내 세팅의 '검색 조건으로': 세팅의 발동 스킬로 세팅 검색 조건을 만들거나 저장한 조건을 고치고 세팅 검색 맨 위로 간다 (DESIGN.md §8).
 * 알림의 '되돌리기'로 바로 전 조건·사용 중인 조건으로 돌아간다
 */
export function useSearchWithBuild() {
  const { db, customTalismans, setTab } = useAppState()
  const { cond, update, replace } = useSearchConditions()
  const { setPresets, active, setActiveId } = useSearchPresets()
  const toast = useToast()

  /**
   * 새 조건으로: 원하는 스킬을 세팅의 스킬로 바꾸고 무기가 있으면 무기도 그 무기로 (fromBuild.ts). 저장한 조건을 불러올 때처럼
   * 사용 중인 저장한 조건과의 연결은 끊는다 (고친 것으로 치면 그 조건의 원하는 스킬이 통째로 바뀌어 저장된다)
   */
  const startNew = (saved: SavedBuild) => {
    const result = conditionsFromBuild(db, saved.build, customTalismans, cond)
    if (result.added.length === 0) {
      toast(result.skippedIds.length > 0 ? '발동 스킬이 모두 비선호 스킬이에요' : '이 세팅에는 발동 스킬이 없어요')
      return
    }
    const previous = cond
    const previousActive = active?.id ?? null
    replace(result.cond)
    setActiveId(null)
    setTab('search', { top: true })
    const weapon = result.weaponChanged ? '와 무기' : ''
    toast(
      `검색 조건을 ‘${saved.name}’의 스킬 ${result.added.length}개${weapon}로 바꿨어요${skippedText(db, result.skippedIds)}`,
      {
        label: '되돌리기',
        onClick: () => {
          replace(previous)
          setActiveId(previousActive)
        },
      },
    )
  }

  /**
   * 저장한 조건 불러오기: 그 조건을 불러와 사용 중으로 두고 세팅의 스킬을 넣는다 (presetFromBuild — 없는 스킬 더하기 / 있는 스킬만
   * 체크, 같은 무기면 무기의 거극 아티어 스킬도 세팅대로). 고친 것은 그 조건에 바로 저장되므로(update → SearchConditionsProvider 의
   * 자동 저장) 되돌리기는 저장한 조건도 되돌린다
   */
  const loadPreset = (saved: SavedBuild, preset: SearchPreset, mode: PresetMode) => {
    const result = presetFromBuild(db, saved.build, customTalismans, presetConditions(preset, cond), mode)
    const previous = cond
    const previousActive = active?.id ?? null
    update(() => result.cond)
    setActiveId(preset.id)
    setTab('search', { top: true })
    const count = result.skills.length
    const head =
      mode === 'check'
        ? `‘${preset.name}’ 조건을 불러와 세팅에 있는 스킬 ${count}개만 체크했어요` +
          (result.lowered > 0 ? ` · ${result.lowered}개는 세팅 레벨로 낮췄어요` : '')
        : count > 0
          ? `‘${preset.name}’ 조건을 불러와 세팅에만 있는 스킬 ${count}개를 더했어요`
          : `‘${preset.name}’ 조건을 불러왔어요 · 세팅의 스킬이 모두 들어 있어요`
    toast(head + weaponText(db, result) + skippedText(db, result.skippedIds), {
      label: '되돌리기',
      onClick: () => {
        replace(previous)
        setActiveId(previousActive)
        if (result.changed) {
          const updatedAt = new Date().toISOString()
          setPresets((list) => list.map((p) => (p.id === preset.id ? { ...p, conditions: preset.conditions, updatedAt } : p)))
        }
      },
    })
  }

  return { startNew, loadPreset }
}
