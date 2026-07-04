import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/db';
import { TokenService } from '../services/token.service';
import { BadRequestError, UnauthorizedError } from '../middleware/error.middleware';

export class AuthController {
  /**
   * Registers a new organization and its primary administrator user.
   */
  public static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationName, email, password } = req.body;

      if (password.length < 8) {
        throw new BadRequestError('Password must be at least 8 characters long');
      }

      // Check if user already exists
      const existingUser = await prisma.users.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new BadRequestError('User with this email already exists');
      }

      // Create Organization and User in a transaction
      const result = await prisma.$transaction(async (tx) => {
        const organization = await tx.organizations.create({
          data: { name: organizationName },
        });

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await tx.users.create({
          data: {
            email,
            passwordHash,
            role: 'OWNER',
            organizationId: organization.id,
          },
        });

        return { user, organization };
      });

      // Generate Tokens
      const tokenPayload = {
        userId: result.user.id,
        email: result.user.email,
        role: result.user.role,
        organizationId: result.organization.id,
      };

      const accessToken = TokenService.generateAccessToken(tokenPayload);
      const refreshToken = TokenService.generateRefreshToken(tokenPayload);

      res.status(201).json({
        message: 'Registration successful',
        accessToken,
        refreshToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
        },
        organization: {
          id: result.organization.id,
          name: result.organization.name,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Logs in a user, returning Access and Refresh tokens.
   */
  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;

      const user = await prisma.users.findUnique({
        where: { email, isDeleted: false },
        include: { organization: true },
      });

      if (!user) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        throw new UnauthorizedError('Invalid email or password');
      }

      // Generate Tokens
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      };

      const accessToken = TokenService.generateAccessToken(tokenPayload);
      const refreshToken = TokenService.generateRefreshToken(tokenPayload);

      res.json({
        message: 'Login successful',
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        organization: {
          id: user.organization.id,
          name: user.organization.name,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Refreshes access token using a valid refresh token.
   */
  public static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new BadRequestError('Refresh token is required');
      }

      let payload: { userId: string; organizationId: string };
      try {
        payload = TokenService.verifyToken<{ userId: string; organizationId: string }>(
          refreshToken,
        );
      } catch (err) {
        throw new UnauthorizedError('Invalid or expired refresh token');
      }

      // Fetch user from DB to ensure validity and get current role
      const user = await prisma.users.findUnique({
        where: { id: payload.userId, isDeleted: false },
      });

      if (!user) {
        throw new UnauthorizedError('User account not found or suspended');
      }

      // Generate new tokens (token rotation)
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      };

      const newAccessToken = TokenService.generateAccessToken(tokenPayload);
      const newRefreshToken = TokenService.generateRefreshToken(tokenPayload);

      res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } catch (err) {
      next(err);
    }
  }
}
