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

function rawEcdsaSigToDer(sigBuf) {
  const len = sigBuf.length / 2
  const r = sigBuf.subarray(0, len)
  const s = sigBuf.subarray(len)

  function encodeInt(buf) {
    while (buf.length > 1 && buf[0] === 0) buf = buf.subarray(1)
    if (buf[0] & 0x80) buf = Buffer.concat([Buffer.alloc(1, 0), buf])
    const hdr = Buffer.alloc(2)
    hdr[0] = 0x02; hdr[1] = buf.length
    return Buffer.concat([hdr, buf])
  }

  const rEnc = encodeInt(r)
  const sEnc = encodeInt(s)
  const inner = Buffer.concat([rEnc, sEnc])
  const der = Buffer.alloc(2)
  der[0] = 0x30; der[1] = inner.length
  return Buffer.concat([der, inner])
}

export function verifyAssertion(credential, clientDataJSON, authenticatorData, signature) {
  const clientDataHash = crypto.createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest()
  const authDataBuf = Buffer.from(authenticatorData, 'base64url')
  const sigBuf = Buffer.from(signature, 'base64url')
  const verifyData = Buffer.concat([authDataBuf, clientDataHash])

  const publicKey = crypto.createPublicKey({ key: credential.public_key_pem, format: 'pem' })

  try {
    if (publicKey.asymmetricKeyType === 'ec') {
      const derSig = rawEcdsaSigToDer(sigBuf)
      return crypto.verify(null, verifyData, publicKey, derSig)
    }
    return crypto.verify('sha256', verifyData, publicKey, sigBuf)
  } catch (e) {
    console.error('verifyAssertion failed:', e.message)
    return false
  }
}

export function base64urlToBuffer(str) {
  return Buffer.from(str, 'base64url')
}

export function bufferToBase64url(buf) {
  return Buffer.from(buf).toString('base64url')
}
