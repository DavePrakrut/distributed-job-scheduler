import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from './error.middleware';

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'email';
  required?: boolean;
}

export function validate(rules: {
  body?: ValidationRule[];
  query?: ValidationRule[];
  params?: ValidationRule[];
}) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const checkRules = (
      data: Record<string, unknown>,
      dataRules?: ValidationRule[],
      location: string = 'body',
    ) => {
      if (!dataRules) return;
      for (const rule of dataRules) {
        const val = data[rule.field];
        if (rule.required && (val === undefined || val === null || val === '')) {
          throw new BadRequestError(
            `Missing required field '${rule.field}' in request ${location}`,
          );
        }
        if (val !== undefined && val !== null && val !== '') {
          if (rule.type === 'email') {
            if (typeof val !== 'string') {
              throw new BadRequestError(`Field '${rule.field}' must be a string`);
            }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(val)) {
              throw new BadRequestError(`Invalid email format for field '${rule.field}'`);
            }
          } else if (typeof val !== rule.type) {
            throw new BadRequestError(`Field '${rule.field}' must be of type ${rule.type}`);
          }
        }
      }
    };

    try {
      checkRules(req.body as Record<string, unknown>, rules.body, 'body');
      checkRules(req.query as Record<string, unknown>, rules.query, 'query');
      checkRules(req.params as Record<string, unknown>, rules.params, 'params');
      next();
    } catch (err) {
      next(err);
    }
  };
}
