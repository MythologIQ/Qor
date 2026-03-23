/**
 * Runtime Interfaces
 *
 * Core interfaces for runtime components.
 */

/**
 * Runtime state store interface
 */
export interface RuntimeStateStore {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): Promise<void>;
}

/**
 * Secret store interface for secure credential storage
 */
export interface SecretStore {
  getSecret(key: string): Promise<string | undefined>;
  setSecret(key: string, value: string): Promise<void>;
}

/**
 * Workspace provider interface for filesystem access
 */
export interface WorkspaceProvider {
  getWorkspaceRoot(): string | undefined;
  resolvePath(...segments: string[]): string;
}
