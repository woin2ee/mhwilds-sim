import { canPlace, resolveEquipment } from '../core/equipment'
import { EQUIP_KEYS, type BuildState, type CustomTalisman } from '../core/types'
import type { GameDb } from '../data/db'

/** 재현 가능한 의사 난수 (mulberry32) */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)]
}

/** 장비 슬롯마다 들어갈 수 있는 장식주를 fill 확률로 무작위로 채운다 */
export function fillDecorations(
  db: GameDb,
  build: BuildState,
  customTalismans: readonly CustomTalisman[],
  rand: () => number,
  fill = 0.75,
): BuildState {
  const equipment = resolveEquipment(db, build, customTalismans)
  const decorations = { ...build.decorations }
  for (const key of EQUIP_KEYS) {
    decorations[key] = (equipment[key]?.slots ?? []).map((slot) => {
      if (rand() > fill) return null
      const options = db.data.decorations.filter((d) => canPlace(d, slot))
      return options.length > 0 ? pick(options, rand).id : null
    })
  }
  return { ...build, decorations }
}
