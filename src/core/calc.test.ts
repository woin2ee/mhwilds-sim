import { describe, expect, it } from 'vitest'
import { armorByName, decorationIdByName, loadTestDb, skillIdByName } from '../test/testDb'
import { activeSkillLevels, computeBuild, missingRequirements, unwantedSkillsOf } from './calc'
import { armorSlots } from './transcend'
import { emptyBuild, type BuildState, type CustomTalisman } from './types'

const db = loadTestDb()

function buildWith(pieces: string[], transcend = false): BuildState {
  const build = emptyBuild()
  for (const name of pieces) {
    const piece = armorByName(db, name)
    build.armor[piece.kind] = { id: piece.id, transcend }
  }
  return build
}

describe('computeBuild', () => {
  it('γ 세트 5부위: 시리즈 스킬 2단계 + 그룹 스킬 발동', () => {
    const summary = computeBuild(
      db,
      buildWith(['슈바르카헬름γ', '슈바르카메일γ', '슈바르카암γ', '슈바르카코일γ', '슈바르카그리브γ']),
    )
    const set = summary.bonuses.find((b) => b.skillId === skillIdByName(db, '쇄인룡의 굶주림'))
    const group = summary.bonuses.find((b) => b.skillId === skillIdByName(db, '주인의 혼'))
    expect(set).toMatchObject({ kind: 'set', pieces: 5, level: 2, nextPieces: null })
    expect(group).toMatchObject({ kind: 'group', pieces: 5, level: 1 })
    const head = armorByName(db, '슈바르카헬름γ')
    expect(summary.defense.base).toBeGreaterThanOrEqual(head.defense.base * 5 - 50)
    expect(summary.slots).toHaveLength(2 + 2 + 2 + 3 + 2)
    expect(summary.freeSlots).toHaveLength(summary.slots.length)
  })

  it('α/β/γ 를 섞어도 같은 시리즈 스킬로 부위 수를 합산한다', () => {
    const summary = computeBuild(db, buildWith(['슈바르카헬름α', '슈바르카메일β', '슈바르카암γ', '슈바르카코일β']))
    const set = summary.bonuses.find((b) => b.skillId === skillIdByName(db, '쇄인룡의 굶주림'))
    expect(set).toMatchObject({ pieces: 4, level: 2 })
    // 그룹 스킬은 세트마다 달라서 3부위를 못 채운다
    expect(summary.bonuses.filter((b) => b.kind === 'group').every((b) => b.level === 0)).toBe(true)
  })

  it('시리즈 스킬 2부위 → 1단계, 다음 단계는 4부위', () => {
    const summary = computeBuild(db, buildWith(['슈바르카헬름γ', '슈바르카메일γ']))
    const set = summary.bonuses.find((b) => b.kind === 'set')
    expect(set).toMatchObject({ pieces: 2, level: 1, nextPieces: 4 })
  })

  it('장식주: 종류/크기가 맞을 때만 스킬로 계산하고, 최대 레벨을 넘으면 잘라낸다', () => {
    const build = buildWith(['슈바르카그리브γ']) // 슬롯 [3, 3]
    const weaknessExploit = skillIdByName(db, '약점 특효')
    const armorDeco = decorationIdByName(db, '통격주【3】')
    const weaponDeco = decorationIdByName(db, '독주【1】')
    build.decorations.legs = [armorDeco, weaponDeco]
    const summary = computeBuild(db, build)
    expect(summary.slots.map((s) => s.valid)).toEqual([true, false])
    const total = summary.skills.find((s) => s.skillId === weaknessExploit)
    expect(total?.contributions).toContainEqual({ from: 'legs', decorationId: armorDeco, level: 1 })
    expect(summary.skills.some((s) => s.skillId === skillIdByName(db, '독속성 강화'))).toBe(false)

    // 같은 장식주를 여러 번 넣어 최대 레벨(5)을 넘기면 level 은 5로 고정
    const many = buildWith(['슈바르카헬름γ', '슈바르카메일γ', '슈바르카코일γ', '슈바르카그리브γ'])
    many.decorations.chest = [armorDeco]
    many.decorations.legs = [armorDeco, armorDeco]
    const capped = computeBuild(db, many).skills.find((s) => s.skillId === weaknessExploit)!
    expect(capped.rawLevel).toBeGreaterThan(5)
    expect(capped.level).toBe(5)
  })

  it('사용자 호석: 스킬과 무기/방어구 슬롯이 모두 반영된다', () => {
    const attack = skillIdByName(db, '공격')
    const talisman: CustomTalisman = {
      id: 't1',
      name: '테스트 호석',
      rarity: 8,
      skills: [{ skillId: attack, level: 2 }],
      slots: [
        { kind: 'weapon', level: 1 },
        { kind: 'armor', level: 1 },
      ],
    }
    const build = emptyBuild()
    build.talisman = { type: 'custom', id: 't1' }
    build.decorations.talisman = [decorationIdByName(db, '독주【1】'), decorationIdByName(db, '내수주【1】')]
    const summary = computeBuild(db, build, [talisman])
    expect(summary.slots.map((s) => [s.slot.kind, s.valid])).toEqual([
      ['weapon', true],
      ['armor', true],
    ])
    const levels = activeSkillLevels(summary)
    expect(levels.get(attack)).toBe(2)
    expect(missingRequirements(summary, [{ skillId: attack, level: 3 }])).toEqual([
      { skillId: attack, required: 3, current: 2 },
    ])
  })

  it('비선호 스킬: 무기 자체 스킬은 세지 않는다', () => {
    const weapon = db.data.weapons.find((w) => w.skills.length > 0 && w.slots.length > 0)!
    const weaponSkill = weapon.skills[0].skillId
    const build = emptyBuild()
    build.weapon = { type: 'db', id: weapon.id }
    expect(unwantedSkillsOf(computeBuild(db, build), [weaponSkill])).toEqual([])
  })

  it('없는 id 는 무시한다 (데이터 갱신 후 저장된 빌드 호환)', () => {
    const build = emptyBuild()
    build.armor.head = { id: 999999, transcend: false }
    build.talisman = { type: 'fixed', id: 999999 }
    const summary = computeBuild(db, build)
    expect(summary.slots).toEqual([])
    expect(summary.skills).toEqual([])
  })
})

describe('방어구 초월', () => {
  it('레어도 5: 3칸 모두 +1 (빈 칸은 Lv1)', () => {
    expect(armorSlots({ rarity: 5, slots: [1] }, true)).toEqual([2, 1, 1])
    expect(armorSlots({ rarity: 5, slots: [1, 1, 1] }, true)).toEqual([2, 2, 2])
    expect(armorSlots({ rarity: 5, slots: [] }, true)).toEqual([1, 1, 1])
  })

  it('레어도 6: 앞 2칸만 +1, 최대 Lv3', () => {
    expect(armorSlots({ rarity: 6, slots: [3] }, true)).toEqual([3, 1])
    expect(armorSlots({ rarity: 6, slots: [2, 1, 1] }, true)).toEqual([3, 2, 1])
    expect(armorSlots({ rarity: 6, slots: [3, 3] }, true)).toEqual([3, 3])
  })

  it('레어도 7·8 및 미적용 시 변화 없음', () => {
    expect(armorSlots({ rarity: 8, slots: [2, 1] }, true)).toEqual([2, 1])
    expect(armorSlots({ rarity: 5, slots: [1] }, false)).toEqual([1])
  })

  it('초월 시 최대 방어력 증가', () => {
    const piece = armorByName(db, '콩가헬름α') // 레어도 5
    const normal = computeBuild(db, buildWith(['콩가헬름α']))
    const transcended = computeBuild(db, buildWith(['콩가헬름α'], true))
    expect(transcended.defense.max - normal.defense.max).toBe(16)
    expect(transcended.slots.map((s) => s.slot.level)).toEqual(armorSlots(piece, true))
  })
})
