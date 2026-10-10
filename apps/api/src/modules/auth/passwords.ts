import { hash, verify } from '@node-rs/argon2';

// OWASP's argon2id baseline: 19 MiB memory, 2 iterations, 1 lane.
// `algorithm: 2` is Algorithm.Argon2id, a const enum that cannot be imported here.
const OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export function verifyPassword(hashed: string, password: string): Promise<boolean> {
  return verify(hashed, password);
}

let dummy: Promise<string> | undefined;
/**
 * Spends the same time as a real check when there is no account, so response
 * times do not reveal which emails are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummy ??= hashPassword('daric-dummy-password');
  await verify(await dummy, password);
  return false;
}
