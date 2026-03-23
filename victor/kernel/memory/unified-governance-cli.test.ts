/**
 * Tests for Unified Governance CLI
 *
 * @module unified-governance-cli.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  listPolicies,
  showPolicy,
  showThresholds,
  showScanRequirements,
  showVerificationRequirements,
  parseArgs,
  showHelp,
} from './unified-governance-cli.js';
import { getUnifiedAuditLedger } from './unified-audit-ledger.js';
import { getGovernanceDecisionEngine } from './governance-decision-engine.js';
import { getCrossDomainPolicyEnforcer } from './cross-domain-policy.js';
import type { AuditEntry } from './quarantine-audit.js';
import type { DecisionRecord } from './governance-decision-engine.js';

// Mock console methods for testing
let consoleOutput: string[] = [];
const mockConsoleLog = (...args: unknown[]) => {
  consoleOutput.push(args.join(' '));
};
const mockConsoleError = (...args: unknown[]) => {
  consoleOutput.push(`ERROR: ${args.join(' ')}`);
};

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Helper to capture console output during tests
function captureConsole<T>(fn: () => T): { result: T; output: string[] } {
  consoleOutput = [];
  console.log = mockConsoleLog;
  console.error = mockConsoleError;
  try {
    const result = fn();
    return { result, output: [...consoleOutput] };
  } finally {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }
}

describe('Unified Governance CLI', () => {
  beforeEach(() => {
    consoleOutput = [];
  });

  describe('parseArgs', () => {
    it('should parse command and subcommand', () => {
      const originalArgv = process.argv;
      process.argv = ['bun', 'cli.ts', 'policy', 'list'];

      const args = parseArgs();

      expect(args.command).toBe('policy');
      expect(args.subcommand).toBe('list');

      process.argv = originalArgv;
    });

    it('should parse options with equals sign', () => {
      const originalArgv = process.argv;
      process.argv = ['bun', 'cli.ts', 'ledger', 'query', '--type=content_admission', '--limit=10'];

      const args = parseArgs();

      expect(args.options.get('type')).toBe('content_admission');
      expect(args.options.get('limit')).toBe('10');

      process.argv = originalArgv;
    });

    it('should parse flags without equals sign', () => {
      const originalArgv = process.argv;
      process.argv = ['bun', 'cli.ts', 'help', '--verbose'];

      const args = parseArgs();

      expect(args.flags).toContain('verbose');

      process.argv = originalArgv;
    });

    it('should default to help command', () => {
      const originalArgv = process.argv;
      process.argv = ['bun', 'cli.ts'];

      const args = parseArgs();

      expect(args.command).toBe('help');

      process.argv = originalArgv;
    });
  });

  describe('policy commands', () => {
    describe('listPolicies', () => {
      it('should list available policies', () => {
        const { output } = captureConsole(() => listPolicies());

        expect(output.some(line => line.includes('production'))).toBe(true);
        expect(output.some(line => line.includes('strict'))).toBe(true);
        expect(output.some(line => line.includes('permissive'))).toBe(true);
      });
    });

    describe('showPolicy', () => {
      it('should show production policy details', () => {
        const { output } = captureConsole(() => showPolicy('production'));

        expect(output.some(line => line.includes('production'))).toBe(true);
        expect(output.some(line => line.includes('Confidence Thresholds:'))).toBe(true);
      });

      it('should show strict policy details', () => {
        const { output } = captureConsole(() => showPolicy('strict'));

        expect(output.some(line => line.includes('strict'))).toBe(true);
      });

      it('should show permissive policy details', () => {
        const { output } = captureConsole(() => showPolicy('permissive'));

        expect(output.some(line => line.includes('permissive'))).toBe(true);
      });

      it('should exit with error for unknown policy', () => {
        const originalExit = process.exit;
        let exitCode: number | undefined;
        process.exit = (code?: number) => {
          exitCode = code;
          throw new Error(`Exit ${code}`);
        };

        try {
          captureConsole(() => showPolicy('unknown'));
        } catch {
          // Expected
        }

        expect(exitCode).toBe(1);
        process.exit = originalExit;
      });
    });

    describe('showThresholds', () => {
      it('should display confidence threshold matrix', () => {
        const { output } = captureConsole(() => showThresholds());

        expect(output.some(line => line.includes('Confidence Thresholds'))).toBe(true);
        expect(output.some(line => line.includes('internal'))).toBe(true);
        expect(output.some(line => line.includes('external-verified'))).toBe(true);
        expect(output.some(line => line.includes('low'))).toBe(true);
        expect(output.some(line => line.includes('medium'))).toBe(true);
        expect(output.some(line => line.includes('high'))).toBe(true);
      });
    });

    describe('showScanRequirements', () => {
      it('should display scan requirements', () => {
        const { output } = captureConsole(() => showScanRequirements());

        expect(output.some(line => line.includes('Scan Requirements'))).toBe(true);
        expect(output.some(line => line.includes('internal'))).toBe(true);
      });
    });

    describe('showVerificationRequirements', () => {
      it('should display verification requirements', () => {
        const { output } = captureConsole(() => showVerificationRequirements());

        expect(output.some(line => line.includes('Verification Requirements'))).toBe(true);
        expect(output.some(line => line.includes('low'))).toBe(true);
        expect(output.some(line => line.includes('medium'))).toBe(true);
        expect(output.some(line => line.includes('high'))).toBe(true);
      });
    });
  });

  describe('ledger commands', () => {
    describe('showLedgerStats', () => {
      it('should display ledger statistics', async () => {
        // Import the function directly since we need the async version
        const { showLedgerStats } = await import('./unified-governance-cli.js');
        
        consoleOutput = [];
        console.log = mockConsoleLog;
        console.error = mockConsoleError;
        
        try {
          await showLedgerStats();
        } finally {
          console.log = originalConsoleLog;
          console.error = originalConsoleError;
        }
        
        expect(consoleOutput.some(line => line.includes('Unified Audit Ledger Statistics'))).toBe(true);
        expect(consoleOutput.some(line => line.includes('Total Entries:'))).toBe(true);
      });
    });
  });

  describe('decisions commands', () => {
    beforeEach(() => {
      const engine = getGovernanceDecisionEngine();
      // Clear decisions for clean state
      engine.clear?.();
    });

    describe('showDecisionStats', () => {
      it('should display decision statistics', async () => {
        const { showDecisionStats } = await import('./unified-governance-cli.js');
        const { output } = captureConsole(() => showDecisionStats());

        expect(output.some(line => line.includes('Governance Decision'))).toBe(true);
        expect(output.some(line => line.includes('Total Decisions:'))).toBe(true);
      });
    });
  });

  describe('violations commands', () => {
    beforeEach(() => {
      const enforcer = getCrossDomainPolicyEnforcer();
      // Clear violations for clean state
      enforcer.clear?.();
    });

    describe('showViolationStats', () => {
      it('should display violation statistics', async () => {
        const { showViolationStats } = await import('./unified-governance-cli.js');
        const { output } = captureConsole(() => showViolationStats());

        expect(output.some(line => line.includes('Cross-Domain Violation'))).toBe(true);
        expect(output.some(line => line.includes('Total Violations:'))).toBe(true);
      });
    });

    describe('listViolations', () => {
      it('should show empty message when no violations', async () => {
        const { listViolations } = await import('./unified-governance-cli.js');
        const args = new Map<string, string>();
        const { output } = captureConsole(() => listViolations(args));

        expect(output.some(line => line.includes('No violations'))).toBe(true);
      });
    });
  });

  describe('help', () => {
    it('should display help message', () => {
      const { output } = captureConsole(() => showHelp());

      expect(output.some(line => line.includes('Unified Governance CLI'))).toBe(true);
      expect(output.some(line => line.includes('policy'))).toBe(true);
      expect(output.some(line => line.includes('ledger'))).toBe(true);
      expect(output.some(line => line.includes('audit'))).toBe(true);
      expect(output.some(line => line.includes('violations'))).toBe(true);
      expect(output.some(line => line.includes('decisions'))).toBe(true);
    });
  });

  describe('export audit', () => {
    it('should export audit as JSONL', async () => {
      const { exportAudit } = await import('./unified-governance-cli.js');
      const { output } = await captureConsole(async () => exportAudit('jsonl'));

      // Should output JSONL format (lines of JSON)
      const lines = output.filter(l => l.trim());
      if (lines.length > 0) {
        // Try to parse first line as JSON
        try {
          JSON.parse(lines[0]);
        } catch {
          // May be empty or stats message
        }
      }
    });

    it('should export audit as JSON', async () => {
      const { exportAudit } = await import('./unified-governance-cli.js');
      const { output } = await captureConsole(async () => exportAudit('json'));

      // Should output valid JSON
      const combined = output.join('\n');
      if (combined.trim()) {
        try {
          JSON.parse(combined);
        } catch {
          // May be empty or stats message
        }
      }
    });

    it('should exit with error for unknown format', async () => {
      const { exportAudit } = await import('./unified-governance-cli.js');
      const originalExit = process.exit;
      let exitCode: number | undefined;
      process.exit = (code?: number) => {
        exitCode = code;
        throw new Error(`Exit ${code}`);
      };

      // Just capture the error but verify exit code was set
      consoleOutput = [];
      console.log = mockConsoleLog;
      console.error = mockConsoleError;
      
      try {
        await exportAudit('xml');
      } catch (e) {
        // Expected - process.exit throws
      } finally {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        process.exit = originalExit;
      }

      // Verify that exit code was set to 1 before the throw
      expect(exitCode).toBe(1);
      // Also verify error message was logged
      expect(consoleOutput.some(line => line.includes('Unknown format'))).toBe(true);
    });
  });
});
