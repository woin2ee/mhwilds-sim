import { useMemo } from 'react'
import { Button } from '../../components/ui'
import { sameTalisman, type DecodedBuild } from '../../core/share'
import type { CustomTalisman } from '../../core/types'
import { useAppState } from '../../state/context'
import { BuildPreview } from './BuildPreview'
import { useDecodedBuildActions } from './useBuildActions'

/** 공유 코드에서 꺼낸 세팅 미리보기 + 열기/저장 */
export function DecodedBuildView({ decoded, onDone }: { decoded: DecodedBuild; onDone: () => void }) {
  const { customTalismans } = useAppState()
  const { open, save } = useDecodedBuildActions()
  const talisman = decoded.talisman
  // 미리보기용: 아직 내 호석에 없는 호석은 자리표시자 id('')로 계산에 넣는다
  const extra = useMemo<CustomTalisman[] | undefined>(
    () => (talisman ? [{ id: '', ...talisman }] : undefined),
    [talisman],
  )
  const willAddTalisman = talisman !== null && !customTalismans.some((t) => sameTalisman(t, talisman))

  return (
    <div className="space-y-4">
      {decoded.name && <p className="text-sm font-semibold">{decoded.name}</p>}
      <BuildPreview build={decoded.build} extraTalismans={extra} />
      {decoded.missing.length > 0 && (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          현재 데이터에서 찾지 못해 비운 항목: {decoded.missing.join(', ')}
        </p>
      )}
      {willAddTalisman && (
        <p className="text-xs text-muted">
          이 세팅의 호석 ‘{talisman.name || '이름 없음'}’은 내 호석에 없어서, 열거나 저장하면 내 호석에 추가돼요.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => {
            save(decoded)
            onDone()
          }}
        >
          내 세팅에 저장
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (open(decoded)) onDone()
          }}
        >
          수동 세팅에서 열기
        </Button>
      </div>
    </div>
  )
}
