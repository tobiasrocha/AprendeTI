import crypto from 'crypto'
import cbor from 'cbor'
import { getDb } from '../database.js'

export function generateChallenge() {
  return crypto.randomBytes(32).toString('base64url')
}

export function parseAttestation(attestationB64) {
  const attestationBuf = Buffer.from(attestationB64, 'base64url')
  const attestation = cbor.decodeFirstSync(attestationBuf)
  const authDataBuf = attestation.authData
  return parseAuthDataBuffer(authDataBuf)
}

export function parseAuthDataBuffer(buf) {
  const rpIdHash = buf.subarray(0, 32)
  const flags = buf.readUInt8(32)
  const signCount = buf.readUInt32BE(33)
  let offset = 37

  let credentialId = null
  let publicKeyPem = null

  if (flags & 0x40) {
    offset += 16
    const credIdLen = buf.readUInt16BE(offset)
    offset += 2
    credentialId = buf.subarray(offset, offset + credIdLen)
    offset += credIdLen

    const coseKey = cbor.decodeFirstSync(buf.subarray(offset))
    publicKeyPem = coseKeyToPem(coseKey)
  }

  return { rpIdHash, flags, signCount, credentialId, publicKeyPem }
}

function coseKeyToPem(coseKey) {
  const kty = coseKey.get(1)
  const alg = coseKey.get(3)

  if (kty === 2) {
    const x = coseKey.get(-2)
    const y = coseKey.get(-3)
    const crv = coseKey.get(-1)
    if (crv === 1) {
      const key = crypto.createPublicKey({
        key: { kty: 'EC', crv: 'P-256', x: x.toString('base64url'), y: y.toString('base64url') },
        format: 'jwk',
      })
      return key.export({ type: 'spki', format: 'pem' })
    }
  }

  if (kty === 3) {
    const n = coseKey.get(-1)
    const e = coseKey.get(-2)
    const key = crypto.createPublicKey({
      key: { kty: 'RSA', n: n.toString('base64url'), e: e.toString('base64url') },
      format: 'jwk',
    })
    return key.export({ type: 'spki', format: 'pem' })
  }

  throw new Error(`Unsupported key type: ${kty}`)
}

export function verifyAssertion(credential, clientDataJSON, authenticatorData, signature) {
  const clientDataHash = crypto.createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest()
  const authDataBuf = Buffer.from(authenticatorData, 'base64url')
  const sigBuf = Buffer.from(signature, 'base64url')
  const verifyData = Buffer.concat([authDataBuf, clientDataHash])

  const publicKey = crypto.createPublicKey({ key: credential.public_key_pem, format: 'pem' })

  let ok = false
  try {
    if (publicKey.asymmetricKeyType === 'ec') {
      ok = crypto.verify(null, verifyData, publicKey, sigBuf)
    } else {
      ok = crypto.verify('sha256', verifyData, publicKey, sigBuf)
    }
  } catch (e) {
    return false
  }

  return ok
}

export function base64urlToBuffer(str) {
  return Buffer.from(str, 'base64url')
}

export function bufferToBase64url(buf) {
  return Buffer.from(buf).toString('base64url')
}
