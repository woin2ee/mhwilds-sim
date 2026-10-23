import { useState } from 'react'
import { Button } from '../../components/ui'
import { suggestName } from '../../core/savedBuilds'
import { useAppState } from '../../state/context'
import type { CompareItem } from '../compare/compareRows'
import { SaveBuildDialog } from '../saved/SaveBuildDialog'

/** 검색 결과 비교 창의 칸 버튼: 수동 세팅에서 열기, 저장 */
export function ResultCompareActions({ item, onClose }: { item: CompareItem; onClose: () => void }) {
  const { db, openInManual } = useAppState()
  const [saving, setSaving] = useState(false)
  /** 알림은 모달 대화상자에 가려지므로 저장했는지는 버튼 글자로 알린다 */
  const [saved, setSaved] = useState(false)
  return (
    <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:flex-wrap">
      <Button
        size="sm"
        title="수동 세팅에서 열기"
        onClick={() => {
          // 탭을 옮기기 전에 닫아야 숨은 검색 화면에 모달이 남지 않는다
          onClose()
          openInManual(item.build)
        }}
      >
        {/* 휴대폰 3칸 폭에는 다 안 들어가서 줄인다 (버튼 안 gap 때문에 글자를 둘로 나누지 않는다) */}
        <span className="sm:hidden">수동 세팅</span>
        <span className="max-sm:hidden">수동 세팅에서 열기</span>
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setSaving(true)}>
        {saved ? '✓ 저장함' : '저장'}
      </Button>
      {saving && (
        <SaveBuildDialog
          open
          onClose={() => setSaving(false)}
          build={item.build}
          defaultName={suggestName(db, item.required ?? [])}
          onSaved={() => setSaved(true)}
        />
      )}
    </div>
  )
}
