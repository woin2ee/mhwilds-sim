import { useEffect, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { SHARE_HASH_KEY } from '../../core/share'
import { useDb } from '../../state/context'
import { DecodedBuildView } from './DecodedBuildView'
import { parseShared, type ParsedShare } from './useBuildActions'

/** 공유 링크(#b=코드)로 들어오면 그 세팅을 불러올지 묻는다 */
export function SharedLinkHandler() {
  const db = useDb()
  const [shared, setShared] = useState<ParsedShare | null>(null)

  useEffect(() => {
    const check = () => {
      if (!window.location.hash.includes(`${SHARE_HASH_KEY}=`)) return
      setShared(parseShared(db, window.location.href))
    }
    check()
    // 이미 열린 탭에 링크를 붙여 넣으면 해시만 바뀐다
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [db])

  const close = () => {
    setShared(null)
    // 새로고침해도 다시 묻지 않도록 주소에서 코드를 지운다
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }

  return (
    <Dialog open={shared !== null} onClose={close} title="공유받은 세팅">
      {shared &&
        ('error' in shared ? (
          <p className="text-sm text-bad">공유 링크를 읽지 못했어요. {shared.error}</p>
        ) : (
          <DecodedBuildView decoded={shared.decoded} onDone={close} />
        ))}
    </Dialog>
  )
}
