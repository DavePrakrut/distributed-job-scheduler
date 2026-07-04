import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-signing-key-for-local-development';
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
}

export class TokenService {
  /**
   * Generates a short-lived access token
   */
  public static generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  }

  /**
   * Generates a long-lived refresh token
   */
  public static generateRefreshToken(payload: TokenPayload): string {
    return jwt.sign(
      { userId: payload.userId, organizationId: payload.organizationId },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRY },
    );
  }

  /**
   * Verifies a JWT token signature and returns the payload
   */
  public static verifyToken<T>(token: string): T {
    return jwt.verify(token, JWT_SECRET) as T;
  }
}
