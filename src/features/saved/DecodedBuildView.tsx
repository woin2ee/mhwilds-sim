import { useMemo } from 'react'
import { Button } from '../../components/ui'
import { linkTalisman } from '../../core/buildUpdates'
import type { DecodedBuild } from '../../core/share'
import { useAppState } from '../../state/context'
import { BuildPreview } from './BuildPreview'
import { useDecodedBuildActions } from './useBuildActions'

/** 공유 코드에서 꺼낸 세팅 미리보기 + 열기/저장 */
export function DecodedBuildView({ decoded, onDone }: { decoded: DecodedBuild; onDone: () => void }) {
  const { customTalismans } = useAppState()
  const { open, save } = useDecodedBuildActions()
  // 열거나 저장할 때와 같은 세팅을 보여 준다 (내용이 같은 내 호석이 있으면 그 호석)
  const build = useMemo(() => linkTalisman(decoded.build, customTalismans), [decoded.build, customTalismans])
  const inline = build.talisman?.type === 'inline' ? build.talisman.talisman : null

  return (
    <div className="space-y-4">
      {decoded.name && <p className="text-sm font-semibold">{decoded.name}</p>}
      <BuildPreview build={build} />
      {decoded.missing.length > 0 && (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          현재 데이터에서 찾지 못해 비운 항목: {decoded.missing.join(', ')}
        </p>
      )}
      {inline && (
        <p className="text-xs text-muted">
          내 호석에 없는 호석(‘{inline.name || '이름 없음'}’)이라 이 세팅에만 담아요. 내 호석에는 추가하지 않아요.
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
