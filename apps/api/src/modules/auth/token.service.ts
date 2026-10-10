import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { errors, jwtVerify, SignJWT } from 'jose';
import { v7 as uuidv7 } from 'uuid';
import type { Config } from '../../config';
import type { Executor } from '../../db/client';
import { refreshTokens } from '../../db/schema';
import { CONFIG } from '../../common/di-tokens';

const ISSUER = 'daric';

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Short-lived JWT access tokens and opaque, stored refresh tokens. */
@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(@Inject(CONFIG) private readonly config: Config) {
    this.key = new TextEncoder().encode(config.JWT_SECRET);
  }

  /** Starts a new refresh-token family (one Signed-in Device) for the User. */
  async issue(db: Executor, userId: string, now = new Date()): Promise<IssuedTokens> {
    const accessTokenExpiresAt = new Date(
      now.getTime() + this.config.ACCESS_TOKEN_TTL_SECONDS * 1000,
    );
    const refreshTokenExpiresAt = new Date(
      now.getTime() + this.config.REFRESH_TOKEN_TTL_SECONDS * 1000,
    );
    const accessToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setIssuedAt(now)
      .setExpirationTime(accessTokenExpiresAt)
      .sign(this.key);
    const refreshToken = randomBytes(32).toString('base64url');
    await db.insert(refreshTokens).values({
      userId,
      familyId: uuidv7(),
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
    });
    return { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt };
  }

  /** The User id of a valid access token, or null. */
  async verifyAccessToken(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        algorithms: ['HS256'],
      });
      return payload.sub ?? null;
    } catch (error) {
      if (error instanceof errors.JOSEError) return null;
      throw error;
    }
  }
}
