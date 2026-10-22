import { useMemo, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { useDb } from '../../state/context'
import { DecodedBuildView } from './DecodedBuildView'
import { parseShared } from './useBuildActions'

/** 공유 링크·코드를 붙여 넣어 가져오기 */
export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="코드로 가져오기">
      <ImportContent onDone={onClose} />
    </Dialog>
  )
}

function ImportContent({ onDone }: { onDone: () => void }) {
  const db = useDb()
  const [text, setText] = useState('')
  const parsed = useMemo(() => parseShared(db, text), [db, text])
  return (
    <div className="space-y-4">
      <textarea
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="공유 링크나 코드를 붙여 넣으세요"
        aria-label="공유 링크 또는 코드"
        className="w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 font-mono text-xs text-fg placeholder:font-sans placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {parsed && 'error' in parsed && <p className="text-sm text-bad">{parsed.error}</p>}
      {parsed && 'decoded' in parsed && <DecodedBuildView decoded={parsed.decoded} onDone={onDone} />}
    </div>
  )
}
