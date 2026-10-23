import { useCallback } from 'react'
import { isEmptyBuild, linkTalisman } from '../../core/buildUpdates'
import { newSavedBuild, type SavedBuild } from '../../core/savedBuilds'
import { decodeBuild, extractShareCode, ShareCodeError, type DecodedBuild } from '../../core/share'
import type { BuildState } from '../../core/types'
import type { GameDb } from '../../data/db'
import { requestPersistentStorage } from '../../lib/storage'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'

export type ParsedShare = { decoded: DecodedBuild } | { error: string }

/** 붙여 넣은 글(코드·링크)을 해석한다. 빈 글이면 null, 코드가 없으면 notFound 를 오류로 */
export function parseShared(
  db: GameDb,
  text: string,
  notFound = '공유 링크나 코드를 찾지 못했어요.',
): ParsedShare | null {
  if (!text.trim()) return null
  let code: string | null = null
  try {
    code = extractShareCode(text)
  } catch {
    code = null
  }
  if (!code) return { error: notFound }
  try {
    return { decoded: decodeBuild(db, code) }
  } catch (err) {
    return { error: err instanceof ShareCodeError ? err.message : '코드를 읽지 못했어요.' }
  }
}

const sameBuild = (a: BuildState, b: BuildState) => JSON.stringify(a) === JSON.stringify(b)

/** 수동 세팅을 다른 세팅으로 바꿔도 되는지. 저장하지 않은 내용이 있으면 확인을 받는다. */
export function useConfirmReplaceManual(): () => boolean {
  const { manualBuild, manualSourceId, savedBuilds } = useAppState()
  return useCallback(() => {
    if (isEmptyBuild(manualBuild)) return true
    const source = manualSourceId ? savedBuilds.find((s) => s.id === manualSourceId) : undefined
    if (source && sameBuild(source.build, manualBuild)) return true
    return window.confirm('수동 세팅을 이 세팅으로 바꿀까요? 저장하지 않은 현재 세팅은 사라져요.')
  }, [manualBuild, manualSourceId, savedBuilds])
}

/**
 * 공유 코드에서 꺼낸 세팅을 수동 세팅으로 열거나 내 세팅에 저장한다. 직접 입력 호석은 내용이 같은 내 호석에 연결하고,
 * 없으면 세팅 전용 호석으로 둔다 (내 호석에는 넣지 않는다)
 */
export function useDecodedBuildActions() {
  const { customTalismans, setSavedBuilds, openInManual } = useAppState()
  const confirmReplace = useConfirmReplaceManual()
  const toast = useToast()

  const open = useCallback(
    (decoded: DecodedBuild): boolean => {
      if (!confirmReplace()) return false
      openInManual(linkTalisman(decoded.build, customTalismans))
      toast('수동 세팅에서 열었어요')
      return true
    },
    [customTalismans, confirmReplace, openInManual, toast],
  )

  const save = useCallback(
    (decoded: DecodedBuild): SavedBuild => {
      const saved = newSavedBuild(linkTalisman(decoded.build, customTalismans), decoded.name ?? '공유받은 세팅')
      setSavedBuilds((list) => [saved, ...list])
      void requestPersistentStorage()
      toast(`내 세팅에 저장했어요 · ${saved.name}`)
      return saved
    },
    [customTalismans, setSavedBuilds, toast],
  )

  return { open, save }
}
