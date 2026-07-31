import { createHash } from 'node:crypto'
import type { SessionTokenService } from '@documind/domain'
import { randomHex } from '../crypto/aes'

export class CryptoSessionTokens implements SessionTokenService {
  createToken(): string {
    return randomHex(32)
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }
}
