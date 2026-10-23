import { describe, expect, it } from 'vitest'
import { ARMOR_KINDS, WEAPON_KINDS } from '../data/types'
import { armorByName, loadTestDb, skillIdByName } from '../test/testDb'
import { computeBuild } from './calc'
import { customWeaponChoice, dbWeaponChoice, GOGMA_ARTIAN_WEAPONS, gogmaSkillsOf, isGogmaArtian } from './gogmaArtian'
import { emptyBuild, type BuildState } from './types'

const db = loadTestDb()
// 슈바르카 방어구: 시리즈 쇄인룡의 굶주림 + 그룹 주인의 혼
const hunger = skillIdByName(db, '쇄인룡의 굶주림')
const lordsSoul = skillIdByName(db, '주인의 혼')
const gogma = db.weaponByGameKey('great-sword', 87)! // 망각의 오스트란차
const plain = db.data.weapons.find((w) => w.kind === 'great-sword' && w.rarity === 8 && !isGogmaArtian(w))!

function buildWith(pieces: string[], weapon: BuildState['weapon']): BuildState {
  const build = { ...emptyBuild(), weapon }
  for (const name of pieces) {
    const piece = armorByName(db, name)
    build.armor[piece.kind] = { id: piece.id, transcend: false }
  }
  return build
}

describe('거극 아티어 무기', () => {
  it('목록의 무기가 데이터에 있다: 종류마다 이름이 같은 격화 타입 3개, 레어도 8, 슬롯 [3,3,3], 무기 스킬 없음', () => {
    for (const kind of WEAPON_KINDS) {
      const weapons = GOGMA_ARTIAN_WEAPONS[kind].map((gameId) => db.weaponByGameKey(kind, gameId)!)
      expect(weapons.every(Boolean), kind).toBe(true)
      expect(new Set(weapons.map((w) => w.name.ko)).size, kind).toBe(1)
      expect(weapons.map((w) => w.affinity).sort((a, b) => a - b), kind).toEqual([-10, 0, 15])
      for (const w of weapons) expect(w, kind).toMatchObject({ rarity: 8, slots: [3, 3, 3], skills: [] })
    }
    expect(db.data.weapons.filter(isGogmaArtian)).toHaveLength(WEAPON_KINDS.length * 3)
  })

  it('시리즈·그룹 스킬은 각각 방어구 1부위로 센다', () => {
    const weapon = dbWeaponChoice(gogma.id, { setSkillId: hunger, groupSkillId: lordsSoul })
    const summary = computeBuild(db, buildWith(['슈바르카헬름γ', '슈바르카메일γ', '슈바르카암γ'], weapon))
    expect(summary.bonuses.find((b) => b.skillId === hunger)).toMatchObject({ pieces: 4, level: 2, nextPieces: null })
    expect(summary.bonuses.find((b) => b.skillId === lordsSoul)).toMatchObject({ pieces: 4, level: 1 })
    expect(ARMOR_KINDS.filter((kind) => summary.equipment[kind])).toHaveLength(3)

    const two = computeBuild(db, buildWith(['슈바르카헬름γ', '슈바르카메일γ'], weapon))
    expect(two.bonuses.find((b) => b.skillId === hunger)).toMatchObject({ pieces: 3, level: 1, nextPieces: 4 })
    expect(two.bonuses.find((b) => b.skillId === lordsSoul)).toMatchObject({ pieces: 3, level: 1 })
  })

  it('무기 혼자서는 발동하지 않는다', () => {
    const weapon = dbWeaponChoice(gogma.id, { setSkillId: hunger, groupSkillId: lordsSoul })
    const summary = computeBuild(db, buildWith([], weapon))
    expect(summary.bonuses).toHaveLength(2)
    for (const skillId of [hunger, lordsSoul]) {
      expect(summary.bonuses.find((b) => b.skillId === skillId)).toMatchObject({ pieces: 1, level: 0 })
    }
  })

  it('직접 입력 무기에도 넣을 수 있다 (스킬 종류만 확인)', () => {
    const weapon = customWeaponChoice([3, 3, 3], [], { setSkillId: hunger, groupSkillId: lordsSoul })
    const summary = computeBuild(db, buildWith(['슈바르카헬름γ', '슈바르카메일γ', '슈바르카암γ'], weapon))
    expect(summary.bonuses.find((b) => b.skillId === hunger)).toMatchObject({ pieces: 4, level: 2 })
    expect(summary.bonuses.find((b) => b.skillId === lordsSoul)).toMatchObject({ pieces: 4, level: 1 })
    expect(gogmaSkillsOf(db, { ...weapon, setSkillId: lordsSoul })).toEqual({ setSkillId: null, groupSkillId: lordsSoul })
  })

  it('거극 아티어가 아닌 무기의 값, 종류가 맞지 않는 스킬은 무시한다', () => {
    expect(gogmaSkillsOf(db, { type: 'db', id: plain.id, setSkillId: hunger, groupSkillId: lordsSoul })).toEqual({
      setSkillId: null,
      groupSkillId: null,
    })
    expect(computeBuild(db, buildWith([], { type: 'db', id: plain.id, setSkillId: hunger })).bonuses).toEqual([])
    // 시리즈 칸에 그룹 스킬, 그룹 칸에 방어구 스킬
    const wrong = { type: 'db', id: gogma.id, setSkillId: lordsSoul, groupSkillId: skillIdByName(db, '공격') } as const
    expect(gogmaSkillsOf(db, wrong)).toEqual({ setSkillId: null, groupSkillId: null })
    expect(gogmaSkillsOf(db, { type: 'custom', slots: [3], skills: [] })).toEqual({ setSkillId: null, groupSkillId: null })
  })

  it('dbWeaponChoice·customWeaponChoice: 고른 스킬만 담고 키 순서가 늘 같다', () => {
    expect(dbWeaponChoice(gogma.id)).toEqual({ type: 'db', id: gogma.id })
    expect(Object.keys(dbWeaponChoice(gogma.id, { setSkillId: null, groupSkillId: lordsSoul }))).toEqual([
      'type',
      'id',
      'groupSkillId',
    ])
    expect(JSON.stringify(dbWeaponChoice(gogma.id, { groupSkillId: lordsSoul, setSkillId: hunger }))).toBe(
      JSON.stringify({ type: 'db', id: gogma.id, setSkillId: hunger, groupSkillId: lordsSoul }),
    )
    expect(customWeaponChoice([3], [])).toEqual({ type: 'custom', slots: [3], skills: [] })
    expect(Object.keys(customWeaponChoice([3], [], { groupSkillId: lordsSoul, setSkillId: hunger }))).toEqual([
      'type',
      'slots',
      'skills',
      'setSkillId',
      'groupSkillId',
    ])
  })
})
