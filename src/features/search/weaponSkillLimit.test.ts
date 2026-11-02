import { describe, expect, it } from 'vitest'
import type { CustomTalisman } from '../../core/types'
import { loadTestDb, skillIdByName } from '../../test/testDb'
import { DEFAULT_CONDITIONS, normalizeConditions, type RequiredSkill, type SearchConditions } from './conditions'
import { addWithinWeaponLimit, weaponLimitWarning, weaponRowLimitText, weaponSkillLimit } from './weaponSkillLimit'

const db = loadTestDb()
const sid = (name: string) => skillIdByName(db, name)
const on = (name: string, level: number): RequiredSkill => ({ skillId: sid(name), level })
const off = (name: string, level: number): RequiredSkill => ({ skillId: sid(name), level, off: true })
const cond = (patch: Partial<SearchConditions>) => normalizeConditions({ ...DEFAULT_CONDITIONS, ...patch })
/** 슬롯 직접 지정 무기 */
const customWeapon = (slots: number[], patch: Partial<SearchConditions> = {}) =>
  cond({ weaponMode: 'custom', customWeaponSlots: slots, ...patch })
const FOUR = [on('명검', 3), on('용속성 공격 강화', 3), on('집중', 3), on('고속 변형', 3)]

/** 무기 스킬 줄의 켤 수 있는 레벨과 안내 */
function rowOf(c: SearchConditions, name: string, talismans: CustomTalisman[] = []) {
  const limit = weaponSkillLimit(db, c, talismans)
  const row = limit.rows.get(sid(name))!
  return { ...row, text: weaponRowLimitText(limit, row) }
}

describe('원하는 무기 스킬 켜기 제한', () => {
  it('켠 무기 스킬과 함께 못 띄우는 스킬은 어떤 레벨로도 켜지 못한다', () => {
    const c = customWeapon([3, 3, 3], { required: [...FOUR, off('회심격【속성】', 3)] })
    expect(rowOf(c, '회심격【속성】')).toEqual({ max: 0, aloneMax: 3, text: '켠 다른 무기 스킬과 함께 띄울 수 없어요' })
    expect(rowOf(c, '명검').max).toBe(3)
  })

  it('켠 스킬은 함께 띄울 수 있는 레벨까지만 올린다', () => {
    const c = customWeapon([3, 3, 3], { required: [on('간파', 3), on('명검', 3), on('집중', 3)] })
    expect(rowOf(c, '간파')).toEqual({ max: 3, aloneMax: 5, text: '켠 다른 무기 스킬과 함께는 Lv3까지만 띄울 수 있어요' })
  })

  it('다른 스킬이 아니라 무기·호석 때문이면 그렇게 알린다', () => {
    const c = customWeapon([1, 0, 0], { required: [off('간파', 5)] })
    expect(rowOf(c, '간파').text).toBe('지금 무기·호석으로는 Lv1까지만 띄울 수 있어요')
  })

  it('무기를 정하지 않았으면 모든 무기로 따진다', () => {
    const required = [
      on('명검', 3),
      on('용속성 공격 강화', 3),
      on('고속 변형', 3),
      on('회심격【속성】', 3),
      off('집중', 3),
      off('불속성 공격 강화', 3),
    ]
    const limit = weaponSkillLimit(db, cond({ required }), [])
    expect(limit.anyWeapon).toBe(true)
    // 깨진 봉인거울의 검【용와】(슬롯 [3,3,3] + 집중3) 으로 집중은 다섯째 Lv3 로 켤 수 있다
    expect(limit.rows.get(sid('집중'))?.max).toBe(3)
    expect(limit.rows.get(sid('불속성 공격 강화'))?.max).toBe(0)
    // 무기 선택에서 아직 무기를 안 골랐을 때도
    expect(weaponSkillLimit(db, cond({ required, weaponMode: 'db', weaponId: null }), []).anyWeapon).toBe(true)
    // 장식주 없이 찾으면 무기에 붙은 스킬로만
    expect(rowOf(cond({ required: [off('명검', 3)], useDecorations: false }), '명검').text).toBe(
      '어떤 무기로도 띄울 수 없어요',
    )
  })

  it('호석 후보의 무기 슬롯도 센다 (호석 모드·비선호 아예 제외를 따른다)', () => {
    const talisman: CustomTalisman = {
      id: 'mine',
      name: '',
      rarity: 8,
      skills: [{ skillId: sid('회피 성능'), level: 1 }],
      slots: [{ kind: 'weapon', level: 1 }],
    }
    const c = customWeapon([3, 3, 3], { required: [...FOUR, off('회심격【속성】', 3)] })
    expect(rowOf(c, '회심격【속성】', [talisman]).max).toBe(1) // 속회주【1】
    expect(rowOf({ ...c, talismanMode: 'none' }, '회심격【속성】', [talisman]).max).toBe(0)
    const excluded = { ...c, excluded: [sid('회피 성능')], excludeMode: 'exclude' as const }
    expect(rowOf(excluded, '회심격【속성】', [talisman]).max).toBe(0)
  })

  it('켠 무기 스킬을 이미 모두 못 띄우면 알리고, 켠 스킬은 지금 레벨에서 더 올리지 못한다', () => {
    const c = customWeapon([3, 2, 1], {
      required: [on('명검', 3), on('용속성 공격 강화', 3), on('집중', 2), off('간파', 1)],
    })
    const limit = weaponSkillLimit(db, c, [])
    expect(limit.fits).toBe(false)
    expect(weaponLimitWarning(limit)).toBe(
      '켠 무기 스킬을 지금 무기·호석으로는 모두 띄울 수 없어요. 끄거나 레벨을 낮추세요.',
    )
    expect(limit.rows.get(sid('집중'))?.max).toBe(2)
    expect(limit.rows.get(sid('간파'))?.max).toBe(0)
  })

  it('함께 못 띄우는 무기 스킬은 최대 레벨 그대로 꺼 둔 채로 넣는다', () => {
    const full = customWeapon([3, 3, 3], { required: FOUR })
    const added = addWithinWeaponLimit(db, full, [], db.skill(sid('회심격【속성】')))
    expect(added.blocked).toBe('켠 다른 무기 스킬과 함께 띄울 수 없어요')
    expect(added.list.required.at(-1)).toEqual({ skillId: sid('회심격【속성】'), level: 3, off: true })
    // 낮은 레벨로는 켤 수 있어도 레벨은 그대로 두고 끈다
    const two = customWeapon([3, 3, 3], { required: [on('명검', 3), on('집중', 3)] })
    const critical = addWithinWeaponLimit(db, two, [], db.skill(sid('간파')))
    expect(critical.blocked).toBe('켠 다른 무기 스킬과 함께는 Lv3까지만 띄울 수 있어요')
    expect(critical.list.required.at(-1)).toEqual({ skillId: sid('간파'), level: 5, off: true })
    // 켤 수 있으면 켜서
    expect(addWithinWeaponLimit(db, customWeapon([3, 3, 3]), [], db.skill(sid('회심격【속성】')))).toEqual({
      list: { required: [{ skillId: sid('회심격【속성】'), level: 3 }], requiredDividers: [] },
      blocked: null,
    })
    // 방어구 스킬은 늘 켜서
    const weakness = db.skill(sid('약점 특효'))
    const armor = addWithinWeaponLimit(db, full, [], weakness)
    expect(armor.blocked).toBeNull()
    expect(armor.list.required[0]).toEqual({ skillId: weakness.id, level: weakness.maxLevel })
  })
})
