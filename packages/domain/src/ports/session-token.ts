export interface SessionTokenService {
  createToken(): string
  hashToken(token: string): string
}
