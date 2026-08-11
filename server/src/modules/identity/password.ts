import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const keyLength = 64;
const parameters = { N: 16_384, r: 8, p: 1 } as const;

function deriveKey(password: string, salt: string, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')): Promise<string> {
  const derived = await deriveKey(password, salt, parameters);
  return `scrypt$${parameters.N}$${parameters.r}$${parameters.p}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, encoded] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !n || !r || !p || !salt || !encoded) return false;
  const expected = Buffer.from(encoded, 'hex');
  if (expected.length !== keyLength) return false;
  const actual = await deriveKey(password, salt, { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);
}
