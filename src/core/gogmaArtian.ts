import type { GameDb } from '../data/db'
import type { SkillPoint, SlotLevel, Weapon, WeaponKind } from '../data/types'
import type { WeaponChoice } from './types'

// 거극 아티어 무기: 아티어 무기를 고그마지오스 소재로 거극 강화한 무기 (무료 타이틀 업데이트 4).
// 시리즈 스킬과 그룹 스킬이 하나씩 무작위로 붙고(부식된 장치로 다시 뽑는다), 각각 방어구 1부위로 센다 — 무기 혼자서는 발동하지 않는다.
// MHDB 데이터에는 거극 아티어인지 표시가 없고 붙은 스킬은 무기마다 달라서, 무기는 게임 내부 id 로 적고 스킬은 사용자가 고른다.
// 무기 종류마다 격화 타입(공격·회심·속성)별로 3개씩 있다. 직접 입력 무기에도 붙은 스킬을 넣을 수 있다.
// 출처: game8 'Gogma Artian Weapons', monsterhunterwiki.org, Yahoo!知恵袋 '巨戟強化でつくグループスキルは防具一部位分'
// (2026-10 확인). 인게임과 다르면 이 파일만 고치면 된다.

/** 무기 종류별 거극 아티어 무기 gameId (무기는 (종류, gameId)로 식별, DESIGN.md §8.1) */
export const GOGMA_ARTIAN_WEAPONS: Readonly<Record<WeaponKind, readonly number[]>> = {
  'great-sword': [87, 88, 89], // 망각의 오스트란차
  'long-sword': [91, 92, 99], // 참죄의 엘간시오
  'sword-shield': [95, 96, 97], // 파멸의 키리에베르도
  'dual-blades': [90, 91, 92], // 영결의 클라우클라이스
  hammer: [86, 87, 88], // 금계의 데스반켈
  'hunting-horn': [86, 87, 88], // 암흑의 테르프리티카
  lance: [85, 86, 87], // 천애의 게하른로우
  gunlance: [84, 85, 86], // 전조의 프로페네시스
  'switch-axe': [80, 81, 82], // 사집의 콘키엘레강
  'charge-blade': [85, 86, 87], // 대상의 네이디 기어
  'insect-glaive': [86, 87, 88], // 타락의 라크리에리카
  'light-bowgun': [86, 87, 88], // 형관의 디스토레이터
  'heavy-bowgun': [80, 81, 82], // 전율의 헬섀펜
  bow: [91, 92, 99], // 망국의 큐피도바인
}

export function isGogmaArtian(weapon: Pick<Weapon, 'kind' | 'gameId'>): boolean {
  return GOGMA_ARTIAN_WEAPONS[weapon.kind]?.includes(weapon.gameId) ?? false
}

/** 거극 아티어 무기에 붙은 시리즈/그룹 스킬 (각각 1부위). 없으면 null */
export interface GogmaSkills {
  setSkillId: number | null
  groupSkillId: number | null
}

const NO_GOGMA_SKILLS: GogmaSkills = { setSkillId: null, groupSkillId: null }

/**
 * 무기 선택에 담긴 거극 아티어 스킬. 종류가 맞지 않는 스킬과 거극 아티어가 아닌 DB 무기의 값은 뺀다
 * (직접 입력 무기는 사용자가 넣은 대로 쓴다).
 */
export function gogmaSkillsOf(db: GameDb, choice: WeaponChoice | null): GogmaSkills {
  if (!choice) return NO_GOGMA_SKILLS
  if (choice.type === 'db') {
    const weapon = db.weapons.get(choice.id)
    if (!weapon || !isGogmaArtian(weapon)) return NO_GOGMA_SKILLS
  }
  const ofKind = (id: number | undefined, kind: 'set' | 'group') =>
    id !== undefined && db.skills.get(id)?.kind === kind ? id : null
  return { setSkillId: ofKind(choice.setSkillId, 'set'), groupSkillId: ofKind(choice.groupSkillId, 'group') }
}

/**
 * 거극 아티어 스킬은 고른 것만 키로 담는다. 무기 선택은 아래 두 함수로 만들어 키 순서를 늘 같게 하고,
 * 세팅을 JSON 으로 비교하는 곳(비교 목록·장비 행)에서 같은 무기가 같게 보이게 한다.
 */
const gogmaFields = (skills: GogmaSkills) => ({
  ...(skills.setSkillId !== null ? { setSkillId: skills.setSkillId } : {}),
  ...(skills.groupSkillId !== null ? { groupSkillId: skills.groupSkillId } : {}),
})

export function dbWeaponChoice(
  id: number,
  skills: GogmaSkills = NO_GOGMA_SKILLS,
): Extract<WeaponChoice, { type: 'db' }> {
  return { type: 'db', id, ...gogmaFields(skills) }
}

export function customWeaponChoice(
  slots: SlotLevel[],
  skills: SkillPoint[],
  gogma: GogmaSkills = NO_GOGMA_SKILLS,
): Extract<WeaponChoice, { type: 'custom' }> {
  return { type: 'custom', slots, skills, ...gogmaFields(gogma) }
}
