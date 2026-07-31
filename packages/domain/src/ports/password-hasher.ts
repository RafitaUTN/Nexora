export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(password: string, encoded: string): Promise<boolean>
}
