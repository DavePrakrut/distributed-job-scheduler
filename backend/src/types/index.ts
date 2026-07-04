import { Request } from 'express';
import { TokenPayload } from '../services/token.service';

export interface AuthenticatedRequest extends Request {
  user: TokenPayload;
}
