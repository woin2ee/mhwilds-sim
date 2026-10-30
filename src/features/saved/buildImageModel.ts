// 공유 이미지에 들어갈 내용 (DESIGN.md §8.6). 합계는 computeBuild 로만 계산하고, 여기서는 보일 글만 정한다.
import { computeBuild } from '../../core/calc'
import { isGogmaArtian } from '../../core/gogmaArtian'
import { buildWeaponKind } from '../../core/savedBuilds'
import { canTranscend } from '../../core/transcend'
import { EQUIP_KEYS, type BuildState, type CustomTalisman, type EquipKey, type Slot } from '../../core/types'
import { nameOf, type GameDb } from '../../data/db'
import { skillName, skillPointsText } from '../../data/format'
import { RESISTANCE_LABEL, WEAPON_KIND_LABEL } from '../../data/labels'
import { ELEMENTS, type WeaponKind } from '../../data/types'
import { EQUIP_LABEL } from '../manual/labels'

export interface ImageSlot {
  slot: Slot
  /** 든 장식주 이름 (빈 슬롯이면 null) */
  decoration: string | null
  /** 장식주가 슬롯에 맞지 않아 계산에서 빠졌다 */
  invalid: boolean
}

export interface ImageEquip {
  key: EquipKey
  label: string
  /** 장비 이름 (미장착이면 null) */
  name: string | null
  /** 이름을 흐리게: 무기를 정하지 않고 슬롯·스킬만 넣은 직접 입력 무기 ('설정 안 함') */
  unset: boolean
  /** 이름 옆 표시 (초월, 거극 아티어) */
  tags: string[]
  /** 장비 자체 스킬. 무기·호석만 (방어구 스킬은 이름으로 알 수 있다) */
  skills: string | null
  /** 거극 아티어 무기에 붙은 시리즈·그룹 스킬 (각각 1부위) */
  bonusSkills: { name: string; kind: 'set' | 'group' }[]
  /** 장비의 슬롯 순서 그대로, 빈 슬롯 포함 */
  slots: ImageSlot[]
}

export interface ImageSkill {
  name: string
  level: number
  maxLevel: number
}

/** 발동한 시리즈·그룹 스킬 */
export interface ImageBonus {
  name: string
  kind: 'set' | 'group'
  pieces: number
  /** 발동 단계 이름 (예: 무진장Ⅱ) */
  rank: string
  /** 거극 아티어 무기가 센 1부위가 들어 있다 */
  fromWeapon: boolean
}

export interface BuildImageModel {
  /** 빈 글이면 제목 줄을 그리지 않는다 */
  title: string
  equipment: ImageEquip[]
  bonuses: ImageBonus[]
  /** 방어구 스킬 → 무기 스킬 (수동 세팅 결과와 같은 순서, 한 줄에 하나), 스킬이 없는 묶음은 뺀다 */
  skillGroups: { title: string; skills: ImageSkill[] }[]
  defense: number
  /** 게임 화면처럼 세로로: 불 내성 · 물 내성 · 번개 내성 · 얼음 내성 · 용 내성 */
  resistances: { label: string; value: number }[]
  freeSlots: Slot[]
  /** 이미지 맨 아래 출처 글 */
  footer: string
}

export const APP_TITLE = '와일즈 스킬 시뮬레이터 (비공식)'

export interface BuildImageOptions {
  title: string
  /** 직접 입력 무기의 종류 (내 세팅에 저장할 때 고른 것). DB 무기는 무기의 종류를 쓴다 */
  weaponKind?: WeaponKind | null
  /** 사이트 주소 (예: woin2ee.github.io/mhwilds-sim) */
  site: string
}

export function buildImageModel(
  db: GameDb,
  build: BuildState,
  customTalismans: readonly CustomTalisman[],
  options: BuildImageOptions,
): BuildImageModel {
  const summary = computeBuild(db, build, customTalismans)
  const decorationName = (id: number | null) => {
    const decoration = id !== null ? db.decorations.get(id) : undefined
    return decoration ? nameOf(decoration.name) : null
  }

  const equipName = (key: EquipKey, resolvedName: string): string => {
    if (key === 'weapon') {
      const kind = buildWeaponKind(db, build) ?? options.weaponKind ?? null
      return kind ? `${WEAPON_KIND_LABEL[kind]} · ${resolvedName}` : resolvedName
    }
    // 이름이 빈 직접 입력 호석은 '세팅 전용 호석'·'내 호석' 대신 받는 사람도 알아볼 이름으로
    const ref = build.talisman
    if (key === 'talisman' && ref && ref.type !== 'fixed') {
      const talisman = ref.type === 'inline' ? ref.talisman : customTalismans.find((t) => t.id === ref.id)
      return talisman?.name.trim() || '감정 호석'
    }
    return resolvedName
  }

  const equipTags = (key: EquipKey): string[] => {
    if (key === 'weapon') {
      const weapon = build.weapon?.type === 'db' ? db.weapons.get(build.weapon.id) : undefined
      return weapon && isGogmaArtian(weapon) ? ['거극 아티어'] : []
    }
    if (key === 'talisman') return []
    const choice = build.armor[key]
    const piece = choice ? db.armor.get(choice.id) : undefined
    return choice?.transcend && piece && canTranscend(piece) ? ['초월'] : []
  }

  const equipment = EQUIP_KEYS.map((key): ImageEquip => {
    const resolved = summary.equipment[key]
    const ownSkills = resolved && (key === 'weapon' || key === 'talisman') ? resolved.skills : []
    return {
      key,
      label: EQUIP_LABEL[key],
      name: resolved ? equipName(key, resolved.name) : null,
      unset: key === 'weapon' && build.weapon?.type === 'custom',
      tags: resolved ? equipTags(key) : [],
      skills: ownSkills.length > 0 ? skillPointsText(db, ownSkills) : null,
      bonusSkills: (key === 'weapon' ? (resolved?.bonusSkillIds ?? []) : []).flatMap((id) => {
        const skill = db.skills.get(id)
        return skill && (skill.kind === 'set' || skill.kind === 'group')
          ? [{ name: nameOf(skill.name), kind: skill.kind }]
          : []
      }),
      slots: summary.slots
        .filter((usage) => usage.key === key)
        .map((usage) => ({ slot: usage.slot, decoration: decorationName(usage.decorationId), invalid: !usage.valid })),
    }
  })

  const weaponBonusIds = summary.equipment.weapon?.bonusSkillIds ?? []
  const bonuses = summary.bonuses.flatMap((bonus): ImageBonus[] => {
    const skill = db.skills.get(bonus.skillId)
    if (!skill || bonus.level === 0) return []
    const rank = skill.ranks.find((r) => r.level === bonus.level)
    return [
      {
        name: nameOf(skill.name),
        kind: bonus.kind,
        pieces: bonus.pieces,
        rank: rank?.name ? nameOf(rank.name) : `${bonus.level}단계`,
        fromWeapon: weaponBonusIds.includes(bonus.skillId),
      },
    ]
  })

  const skillsOf = (kind: 'armor' | 'weapon') =>
    summary.skills
      .filter((total) => total.level > 0 && db.skills.get(total.skillId)?.kind === kind)
      .map((total) => ({ name: skillName(db, total.skillId), level: total.level, maxLevel: total.maxLevel }))
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, 'ko'))
  const skillGroups = [
    { title: '방어구 스킬', skills: skillsOf('armor') },
    { title: '무기 스킬', skills: skillsOf('weapon') },
  ].filter((group) => group.skills.length > 0)

  return {
    title: options.title.trim(),
    equipment,
    bonuses,
    skillGroups,
    defense: summary.defense.max,
    resistances: ELEMENTS.map((element) => ({ label: RESISTANCE_LABEL[element], value: summary.resistances[element] })),
    freeSlots: summary.freeSlots,
    footer: `${APP_TITLE} · ${options.site}`,
  }
}

