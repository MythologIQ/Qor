/**
 * Circuit Breaker Pattern
 * 
 * Prevents cascading failures by failing fast when a dependency is unhealthy.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failure threshold exceeded, requests fail immediately
 * - HALF_OPEN: Testing if dependency recovered, limited requests allowed
 * 
 * Transitions:
 * - CLOSED → OPEN: When failure rate exceeds threshold
 * - OPEN → HALF_OPEN: After timeout period
 * - HALF_OPEN → CLOSED: When test requests succeed
 * - HALF_OPEN → OPEN: When test requests fail
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time window (ms) for counting failures */
  windowMs: number;
  /** How long to wait before attempting recovery (OPEN → HALF_OPEN) */
  resetTimeoutMs: number;
  /** Number of successful requests needed to close circuit from HALF_OPEN */
  successThreshold: number;
  /** Predicate to determine if error should count as failure */
  isFailure?: (error: unknown) => boolean;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  windowMs: 60000, // 1 minute
  resetTimeoutMs: 30000, // 30 seconds
  successThreshold: 2,
  isFailure: () => true, // All errors count by default
};

interface CircuitMetrics {
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private metrics: CircuitMetrics = {
    failures: 0,
    successes: 0,
    lastFailureTime: 0,
    lastSuccessTime: 0,
    totalRequests: 0,
    totalFailures: 0,
    totalSuccesses: 0,
  };
  private stateChangeTime: number = Date.now();
  private readonly config: CircuitBreakerConfig;

  constructor(
    private readonly name: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.metrics.totalRequests++;

    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      const timeSinceOpen = Date.now() - this.stateChangeTime;
      if (timeSinceOpen >= this.config.resetTimeoutMs) {
        this.transition(CircuitState.HALF_OPEN);
      }
    }

    // Fail fast if circuit is open
    if (this.state === CircuitState.OPEN) {
      throw new CircuitOpenError(
        `Circuit breaker '${this.name}' is OPEN. ` +
          `Last failure: ${new Date(this.metrics.lastFailureTime).toISOString()}`
      );
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.metrics.successes++;
    this.metrics.totalSuccesses++;
    this.metrics.lastSuccessTime = Date.now();

    // Reset failure count in rolling window
    this.resetWindowIfExpired();

    // Transition from HALF_OPEN to CLOSED if success threshold met
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.metrics.successes >= this.config.successThreshold) {
        this.transition(CircuitState.CLOSED);
      }
    }
  }

  private onFailure(error: unknown): void {
    // Only count as failure if predicate matches
    if (this.config.isFailure && !this.config.isFailure(error)) {
      return;
    }

    this.metrics.failures++;
    this.metrics.totalFailures++;
    this.metrics.lastFailureTime = Date.now();

    // Reset window if expired
    this.resetWindowIfExpired();

    // Check if should open circuit
    if (this.state === CircuitState.CLOSED) {
      if (this.metrics.failures >= this.config.failureThreshold) {
        this.transition(CircuitState.OPEN);
      }
    }

    // Transition from HALF_OPEN back to OPEN on any failure
    if (this.state === CircuitState.HALF_OPEN) {
      this.transition(CircuitState.OPEN);
    }
  }

  private resetWindowIfExpired(): void {
    const now = Date.now();
    const windowExpired =
      now - Math.max(this.metrics.lastFailureTime, this.metrics.lastSuccessTime) >
      this.config.windowMs;

    if (windowExpired) {
      this.metrics.failures = 0;
      this.metrics.successes = 0;
    }
  }

  private transition(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.stateChangeTime = Date.now();

    // Reset counters on state change
    this.metrics.failures = 0;
    this.metrics.successes = 0;

    console.log(
      `[CircuitBreaker:${this.name}] State transition: ${oldState} → ${newState} ` +
        `(failures: ${this.metrics.totalFailures}, successes: ${this.metrics.totalSuccesses})`
    );
  }

  /**
   * Get current circuit state and metrics
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      metrics: { ...this.metrics },
      config: { ...this.config },
      stateChangeTime: this.stateChangeTime,
    };
  }

  /**
   * Manually reset circuit to CLOSED state
   */
  reset(): void {
    this.transition(CircuitState.CLOSED);
    this.metrics = {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
    };
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit breaker registry for managing multiple breakers
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  getOrCreate(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAll(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  getAllStatus() {
    return this.getAll().map((breaker) => breaker.getStatus());
  }

  reset(name: string): boolean {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
      return true;
    }
    return false;
  }

  resetAll(): void {
    this.breakers.forEach((breaker) => breaker.reset());
  }
}

// Global registry instance
export const circuitBreakers = new CircuitBreakerRegistry();
