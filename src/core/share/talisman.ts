// 공유 코드·백업에서 꺼낸 직접 입력 호석을 내 호석과 연결 (DESIGN.md §8.2)
import type { BuildState, CustomTalisman, Slot } from '../types'
import type { DecodedBuild, TalismanDraft } from './types'

const slotKey = (slot: Slot) => `${slot.kind}:${slot.level}`

function contentKey(talisman: TalismanDraft): string {
  const skills = talisman.skills.map((p) => `${p.skillId}:${p.level}`).sort()
  const slots = talisman.slots.map(slotKey).sort()
  return `${skills.join(',')}|${slots.join(',')}`
}

/** 이름·id·레어도를 빼고 스킬·슬롯 구성이 같은 호석인지 (순서 무시) */
export function sameTalisman(a: TalismanDraft, b: TalismanDraft): boolean {
  return contentKey(a) === contentKey(b)
}

/**
 * 꺼낸 세팅의 직접 입력 호석을 내 호석과 연결한다. 같은 호석이 있으면 재사용, 없으면 새로 추가한다.
 * 반환하는 customTalismans 는 추가가 반영된 전체 목록.
 */
export function attachTalisman(
  decoded: DecodedBuild,
  customTalismans: readonly CustomTalisman[],
  createId: () => string,
): { build: BuildState; customTalismans: CustomTalisman[]; added: CustomTalisman | null } {
  const list = [...customTalismans]
  const build: BuildState = { ...decoded.build, decorations: { ...decoded.build.decorations } }
  const draft = decoded.talisman
  if (build.talisman?.type !== 'custom' || !draft) {
    // 내용 없는 자리표시자는 버린다
    if (build.talisman?.type === 'custom' && !build.talisman.id) build.talisman = null
    return { build, customTalismans: list, added: null }
  }

  const existing = list.find((t) => sameTalisman(t, draft))
  if (existing) {
    build.talisman = { type: 'custom', id: existing.id }
    build.decorations.talisman = remapDecorations(draft.slots, existing.slots, build.decorations.talisman ?? [])
    return { build, customTalismans: list, added: null }
  }

  const added: CustomTalisman = { ...draft, id: createId(), name: draft.name.trim() || '공유받은 호석' }
  list.push(added)
  build.talisman = { type: 'custom', id: added.id }
  return { build, customTalismans: list, added }
}

/** 슬롯 순서가 다른 같은 호석으로 옮길 때 장식주 위치를 맞춘다 */
function remapDecorations(
  from: readonly Slot[],
  to: readonly Slot[],
  decorations: readonly (number | null)[],
): (number | null)[] {
  if (from.length === to.length && from.every((slot, i) => slotKey(slot) === slotKey(to[i]))) return [...decorations]
  const result: (number | null)[] = to.map(() => null)
  const used = to.map(() => false)
  from.forEach((slot, i) => {
    const j = to.findIndex((target, k) => !used[k] && slotKey(target) === slotKey(slot))
    if (j < 0) return
    used[j] = true
    result[j] = decorations[i] ?? null
  })
  return result
}
