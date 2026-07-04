import { RetryStrategy, RetryPolicies } from '@prisma/client';

export class RetryService {
  /**
   * Calculates the delay in seconds before a job should be retried.
   *
   * @param policy - The queue's Retry Policy config
   * @param attempt - The current retry attempt (1-indexed)
   */
  public static calculateDelay(policy: RetryPolicies, attempt: number): number {
    const base = policy.baseDelaySeconds;
    const factor = policy.factor || 2.0;

    switch (policy.strategy) {
      case RetryStrategy.LINEAR:
        // Linear Backoff: Delay increases linearly with each attempt.
        // Formula: delay = base * attempt
        return base * attempt;

      case RetryStrategy.EXPONENTIAL:
        // Exponential Backoff: Delay increases exponentially.
        // Formula: delay = base * (factor ^ (attempt - 1))
        return base * Math.pow(factor, attempt - 1);

      case RetryStrategy.FIXED:
      default:
        // Fixed Delay: Delay remains constant across all retry attempts.
        // Formula: delay = base
        return base;
    }
  }
}
