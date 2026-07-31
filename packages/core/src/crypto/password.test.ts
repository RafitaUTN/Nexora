import { describe, expect, it } from 'vitest'
import { ScryptPasswordHasher, SCRYPT_DEFAULT_COST, SCRYPT_KEY_BYTES } from './password'

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher()

  it('hashea y verifica una contraseña', async () => {
    const encoded = await hasher.hash('s3cret-pass')
    expect(encoded.startsWith('$scrypt$')).toBe(true)
    expect(await hasher.verify('s3cret-pass', encoded)).toBe(true)
    expect(await hasher.verify('wrong', encoded)).toBe(false)
  })

  it('genera sal distinta por llamada', async () => {
    const a = await hasher.hash('same-pass')
    const b = await hasher.hash('same-pass')
    expect(a).not.toBe(b)
  })

  it('serializa parámetros en el formato PHC', async () => {
    const encoded = await hasher.hash('p')
    const parts = encoded.split('$')
    expect(parts).toHaveLength(5)
    expect(parts[1]).toBe('scrypt')
    const paramsText = parts[2] ?? ''
    const saltText = parts[3] ?? ''
    const hashText = parts[4] ?? ''
    expect(paramsText).toBeTruthy()
    expect(saltText).toBeTruthy()
    expect(hashText).toBeTruthy()
    const params = Object.fromEntries(paramsText.split(',').map((kv) => kv.split('=')))
    expect(params).toMatchObject({
      N: String(SCRYPT_DEFAULT_COST.N),
      r: String(SCRYPT_DEFAULT_COST.r),
      p: String(SCRYPT_DEFAULT_COST.p),
    })
    expect(Buffer.from(saltText, 'base64')).toHaveLength(16)
    expect(Buffer.from(hashText, 'base64')).toHaveLength(SCRYPT_KEY_BYTES)
  })

  it('verifica contra un hash fijo (vector de compatibilidad)', async () => {
    const hash = 'p455w0rd'
    const encoded = await hasher.hash(hash)
    expect(await hasher.verify(hash, encoded)).toBe(true)
  })

  it('rechaza formatos corruptos sin lanzar', async () => {
    expect(await hasher.verify('x', 'not-a-hash')).toBe(false)
    expect(await hasher.verify('x', '$scrypt$N=bad,r=8,p=1$AAAA$AAAA')).toBe(false)
    expect(await hasher.verify('x', '$md5$$$$')).toBe(false)
  })
})
