// 백업 코드: 백업을 복사·붙여넣기로 옮기는 한 줄 글 (DESIGN.md §8.3)
import { textCode } from './textCode'
import type { BackupFile } from './types'

/** 'mhwilds-backup-<형식 버전>.' + base64url */
const backupCode = textCode('backup', '백업 코드', '백업 파일')

/** 붙여 넣은 글에 백업 코드가 들어 있는지 */
export const hasBackupCode = (text: string): boolean => backupCode.has(text)

/** 백업 → 백업 코드 */
export const encodeBackupCode = (file: BackupFile): Promise<string> => backupCode.encode(file)

/** 백업 코드 → importBackup 에 넘길 값. 형식이 틀리면 ShareCodeError */
export const decodeBackupCode = (text: string): Promise<unknown> => backupCode.decode(text)
