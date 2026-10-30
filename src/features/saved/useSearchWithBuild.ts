import type { SavedBuild } from '../../core/savedBuilds'
import type { GameDb } from '../../data/db'
import { skillName } from '../../data/format'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
import { useSearchConditions, useSearchPresets } from '../search/conditionsContext'
import { addBuildSkills, buildSkills, conditionsFromBuild } from '../search/fromBuild'
import { presetConditions, type SearchPreset } from '../search/presets'

/** 알림 끝에 붙는 '비선호 스킬(체술·앙심)은 뺐어요' */
function skippedText(db: GameDb, skippedIds: readonly number[]): string {
  return skippedIds.length > 0 ? ` · 비선호 스킬(${skippedIds.map((id) => skillName(db, id)).join('·')})은 뺐어요` : ''
}

/**
 * 내 세팅의 '검색 조건으로': 세팅의 발동 스킬로 세팅 검색 조건을 만들고 세팅 검색 맨 위로 간다 (DESIGN.md §8).
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
   * 저장한 조건에 더하기: 그 조건을 불러와 사용 중으로 두고, 없는 스킬만 세팅의 레벨로 더한다. 더한 것은 고친 것이라
   * 그 조건에 바로 저장된다 (update → SearchConditionsProvider 의 자동 저장). 무기·옵션·이미 있는 스킬은 그 조건 그대로
   */
  const addToPreset = (saved: SavedBuild, preset: SearchPreset) => {
    const result = addBuildSkills(db, buildSkills(db, saved.build, customTalismans), presetConditions(preset, cond))
    const previous = cond
    const previousActive = active?.id ?? null
    update(() => result.cond)
    setActiveId(preset.id)
    setTab('search', { top: true })
    const added = result.added.length
    toast(
      (added > 0
        ? `‘${preset.name}’ 조건을 불러와 세팅에만 있는 스킬 ${added}개를 더했어요`
        : `‘${preset.name}’ 조건을 불러왔어요 · 세팅의 스킬이 모두 들어 있어요`) + skippedText(db, result.skippedIds),
      {
        label: '되돌리기',
        onClick: () => {
          replace(previous)
          setActiveId(previousActive)
          // 더한 스킬은 그 조건에 저장됐으므로 저장한 조건도 되돌린다
          if (added > 0) {
            const updatedAt = new Date().toISOString()
            setPresets((list) => list.map((p) => (p.id === preset.id ? { ...p, conditions: preset.conditions, updatedAt } : p)))
          }
        },
      },
    )
  }

  return { startNew, addToPreset }
}
