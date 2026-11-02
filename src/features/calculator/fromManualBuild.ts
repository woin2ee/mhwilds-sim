// 수동 세팅의 무기·발동 스킬을 속성치 계산기 입력으로 가져오기
import { activeSkillLevels, computeBuild } from '../../core/calc'
import { buffUnavailable, ELEMENT_BUFFS, type ElementBuffId } from '../../core/elementCalc'
import type { BuildState, CustomTalisman } from '../../core/types'
import type { GameDb } from '../../data/db'
import { RESISTANCE_LABEL } from '../../data/labels'
import { CALC_WEAPON_KINDS, weaponElement, type ElementCalcState } from './elementCalcState'

export interface ImportedCalc {
  state: ElementCalcState
  /** 가져온 스킬 중 이 무기에 효과가 있는 것의 수 */
  skillCount: number
  /** 알림에 덧붙일 말: 무기 속성치를 못 가져온 까닭(직접 넣어야 함), 방어구 합으로 넣은 내성 */
  notes: string[]
}

/**
 * 수동 세팅으로 계산기 입력을 바꾼다. 스킬은 computeBuild 의 발동 레벨(시리즈 스킬은 단계)로 모두 켠다 — 조건부 스킬은
 * 화면에서 끄면 된다. 무기는 데이터에 속성이 있는 무기면 그 무기로, 아니면(아티어 무기·직접 입력 무기) 무기 종류만 맞추고
 * 속성·기본 속성치는 지금 값을 둔다. 수렵피리 선율처럼 세팅에 없는 효과도 지금 값을 둔다
 */
export function importManualBuild(
  db: GameDb,
  build: BuildState,
  customTalismans: readonly CustomTalisman[],
  current: ElementCalcState,
): ImportedCalc {
  const summary = computeBuild(db, build, customTalismans)
  const active = activeSkillLevels(summary)
  const weapon = build.weapon?.type === 'db' ? db.weapons.get(build.weapon.id) : undefined
  const element = weapon ? weaponElement(weapon) : null
  const kind = weapon && (CALC_WEAPON_KINDS as readonly string[]).includes(weapon.kind) ? weapon.kind : current.kind
  const notes: string[] = []

  let state: ElementCalcState
  if (weapon && element && kind === weapon.kind) {
    state = { ...current, mode: 'db', weaponId: weapon.id, kind }
  } else {
    state = { ...current, mode: 'custom', kind }
    if (!build.weapon) notes.push('수동 세팅에 무기가 없어요')
    else if (weapon && kind !== weapon.kind) notes.push('보우건은 계산기에서 계산하지 않아요')
    else notes.push('무기 속성치는 데이터에 없어서 직접 넣어 주세요')
  }

  const weaponEl = state.mode === 'db' && element ? element.element : state.element
  const levels: Partial<Record<ElementBuffId, number>> = {}
  const resistances = { ...current.resistances }
  let skillCount = 0
  for (const buff of ELEMENT_BUFFS) {
    if (!buff.skillGameId) {
      if (current.levels[buff.id]) levels[buff.id] = current.levels[buff.id]
      continue
    }
    const skill = db.skillByGameId(buff.skillGameId(weaponEl))
    const level = skill ? (active.get(skill.id) ?? 0) : 0
    if (level <= 0) continue
    levels[buff.id] = Math.min(level, buff.maxLevel)
    if (buffUnavailable(buff, weaponEl, kind)) continue
    skillCount++
    // 내성 변환: 방어구 내성 합을 처음 값으로 둔다 (스킬·식사 효과는 화면에서 더한다)
    const resistanceOf = buff.resistance?.(weaponEl)
    if (resistanceOf) {
      resistances[resistanceOf] = summary.resistances[resistanceOf]
      notes.push(`${RESISTANCE_LABEL[resistanceOf]}은 방어구 합을 넣었어요`)
    }
  }
  return { state: { ...state, levels, resistances }, skillCount, notes }
}
