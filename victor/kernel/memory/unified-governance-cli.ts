/**
 * Unified Governance CLI
 *
 * Command-line interface for inspecting unified governance policies,
 * querying audit ledgers, and exporting governance data.
 *
 * Commands:
 *   policy list              - List all available policies
 *   policy show <name>       - Show policy details
 *   policy thresholds        - Show confidence threshold matrix
 *   ledger query [filters]   - Query unified audit ledger
 *   ledger stats             - Show ledger statistics
 *   audit export [format]    - Export audit data (jsonl|json)
 *   violations list          - List cross-domain violations
 *   violations stats       - Show violation statistics
 *   decisions query         - Query governance decisions
 *   decisions stats         - Show decision statistics
 *
 * @module unified-governance-cli
 */

import type { UnifiedPolicy, ActionRiskLevel, SourceTrustTier } from './unified-policy.js';
import {
  getPolicyByName,
  DEFAULT_UNIFIED_POLICY,
  STRICT_UNIFIED_POLICY,
  PERMISSIVE_UNIFIED_POLICY,
  describePolicy,
  RISK_LEVEL_DESCRIPTIONS,
} from './unified-policy.js';
import type { UnifiedAuditEntry, UnifiedAuditStats } from './unified-audit-ledger.js';
import { getUnifiedAuditLedger } from './unified-audit-ledger.js';
import type { CrossDomainViolation, CrossDomainStats } from './cross-domain-policy.js';
import { getCrossDomainPolicyEnforcer } from './cross-domain-policy.js';
import type { DecisionRecord, DecisionStats } from './governance-decision-engine.js';
import { getGovernanceDecisionEngine } from './governance-decision-engine.js';

// ============================================================================
// CLI Types
// ============================================================================

type Command = 'policy' | 'ledger' | 'audit' | 'violations' | 'decisions' | 'help';
type PolicySubcommand = 'list' | 'show' | 'thresholds' | 'scan-reqs' | 'verify-reqs';
type LedgerSubcommand = 'query' | 'stats';
type AuditSubcommand = 'export';
type ViolationsSubcommand = 'list' | 'stats';
type DecisionsSubcommand = 'query' | 'stats';

interface CLIParsedArgs {
  command: Command;
  subcommand: string;
  options: Map<string, string>;
  flags: string[];
}

// ============================================================================
// Policy Commands
// ============================================================================

function listPolicies(): void {
  const policies = [
    { name: 'production', description: 'Default production policy with balanced security' },
    { name: 'strict', description: 'High-security policy with elevated requirements' },
    { name: 'permissive', description: 'Development/testing policy with relaxed requirements' },
  ];

  console.log('Available Policies\n');
  for (const policy of policies) {
    const current = policy.name === DEFAULT_UNIFIED_POLICY.name ? ' (current)' : '';
    console.log(`  ${policy.name}${current}`);
    console.log(`    ${policy.description}`);
    console.log('');
  }
}

function showPolicy(name: string): void {
  const policy = getPolicyByName(name);
  if (!policy) {
    console.error(`Error: Unknown policy '${name}'`);
    console.error("Available policies: production, strict, permissive");
    process.exit(1);
  }

  console.log(describePolicy(policy));
}

function showThresholds(): void {
  const policy = DEFAULT_UNIFIED_POLICY;

  console.log('Confidence Thresholds (Production Policy)\n');
  console.log('Format: [trust tier] + [risk level] = minimum confidence required\n');

  const tiers: SourceTrustTier[] = ['internal', 'internal-generated', 'external-verified', 'external-untrusted'];
  const levels: ActionRiskLevel[] = ['low', 'medium', 'high'];

  // Header
  let header = 'Trust Tier          |';
  for (const level of levels) {
    header += ` ${level.padEnd(8)}|`;
  }
  console.log(header);
  console.log('-'.repeat(header.length));

  // Rows
  for (const tier of tiers) {
    const thresholds = policy.confidenceThresholds[tier];
    let row = `${tier.padEnd(20)}|`;
    for (const level of levels) {
      const value = thresholds[level];
      const formatted = `${(value * 100).toFixed(0)}%`.padEnd(8);
      row += ` ${formatted}|`;
    }
    console.log(row);
  }

  console.log('\nRisk Level Descriptions:');
  for (const level of levels) {
    console.log(`  ${level}: ${RISK_LEVEL_DESCRIPTIONS[level]}`);
  }

  console.log('\nNote: Confidence thresholds are multiplied by verification completion ratio.');
  console.log('      Missing verifications reduce effective confidence.');
}

function showScanRequirements(): void {
  const policy = DEFAULT_UNIFIED_POLICY;

  console.log('Scan Requirements by Trust Tier\n');

  const tiers: SourceTrustTier[] = ['internal', 'internal-generated', 'external-verified', 'external-untrusted'];

  for (const tier of tiers) {
    const categories = policy.scanRequirements[tier];
    console.log(`${tier}:`);
    if (categories.length === 0) {
      console.log('  (none - minimal scanning)');
    } else {
      for (const cat of categories) {
        console.log(`  - ${cat}`);
      }
    }
    console.log('');
  }
}

function showVerificationRequirements(): void {
  const policy = DEFAULT_UNIFIED_POLICY;

  console.log('Verification Requirements by Risk Level\n');

  const levels: ActionRiskLevel[] = ['low', 'medium', 'high'];

  for (const level of levels) {
    const steps = policy.verificationRequirements[level];
    console.log(`${level} (${RISK_LEVEL_DESCRIPTIONS[level]}):`);
    for (const step of steps) {
      console.log(`  - ${step}`);
    }
    console.log('');
  }
}

// ============================================================================
// Ledger Commands
// ============================================================================

async function queryLedger(args: Map<string, string>): Promise<void> {
  const ledger = getUnifiedAuditLedger();
  await ledger.initialize();

  const filters: Record<string, unknown> = {};

  if (args.has('type')) filters.type = args.get('type')!;
  if (args.has('subject')) filters.subjectId = args.get('subject')!;
  if (args.has('actor')) filters.actorId = args.get('actor')!;
  if (args.has('verdict')) filters.verdict = args.get('verdict')!;
  if (args.has('project')) filters.projectId = args.get('project')!;
  if (args.has('limit')) filters.limit = parseInt(args.get('limit')!, 10);

  // Time range
  if (args.has('after')) {
    const after = args.get('after')!;
    filters.after = after.includes('T') ? new Date(after).getTime() : parseInt(after, 10);
  }
  if (args.has('before')) {
    const before = args.get('before')!;
    filters.before = before.includes('T') ? new Date(before).getTime() : parseInt(before, 10);
  }

  const entries = ledger.query(filters);

  if (entries.length === 0) {
    console.log('No entries match the specified filters.');
    return;
  }

  console.log(`Found ${entries.length} entries\n`);

  for (const entry of entries.slice(0, 20)) {
    printLedgerEntry(entry);
    console.log('');
  }

  if (entries.length > 20) {
    console.log(`... and ${entries.length - 20} more entries`);
  }
}

function printLedgerEntry(entry: UnifiedAuditEntry): void {
  console.log(`  ID:        ${entry.id}`);
  console.log(`  Type:      ${entry.type}`);
  console.log(`  Subject:   ${entry.subjectId}`);
  console.log(`  Actor:     ${entry.actor.id} (${entry.actor.type})`);
  console.log(`  Verdict:   ${entry.verdict}`);
  console.log(`  Confidence: ${(entry.confidence * 100).toFixed(1)}%`);
  console.log(`  Timestamp: ${entry.isoDate}`);
  console.log(`  Policy:    ${entry.policy.name} v${entry.policy.version}`);

  if (entry.context.projectId) {
    console.log(`  Project:   ${entry.context.projectId}`);
  }
  if (entry.context.sourceTrustTier) {
    console.log(`  Trust Tier: ${entry.context.sourceTrustTier}`);
  }

  if (entry.requiresReview) {
    console.log(`  ⚠️  Requires Review`);
  }

  // Truncate reasoning if too long
  const reasoning = entry.reasoning;
  if (reasoning.length > 100) {
    console.log(`  Reason:    ${reasoning.slice(0, 100)}...`);
  } else {
    console.log(`  Reason:    ${reasoning}`);
  }
}

async function showLedgerStats(): Promise<void> {
  const ledger = getUnifiedAuditLedger();
  await ledger.initialize();

  const stats = ledger.getStats();

  console.log('Unified Audit Ledger Statistics\n');
  console.log(`Total Entries:      ${stats?.total ?? 0}`);
  console.log(`Requiring Review:   ${stats?.requiringReview ?? 0}`);
  console.log(`Reviewed:           ${stats?.reviewed ?? 0}`);
  console.log(`Average Confidence: ${((stats?.averageConfidence ?? 0) * 100).toFixed(1)}%`);

  if (stats?.dateRange?.earliest && stats.dateRange.earliest > 0) {
    const earliest = new Date(stats.dateRange.earliest).toISOString();
    const latest = new Date(stats.dateRange.latest).toISOString();
    console.log(`Date Range:         ${earliest} to ${latest}`);
  }

  console.log('\nBy Type:');
  for (const [type, count] of Object.entries(stats?.byType ?? {})) {
    if (count > 0) {
      console.log(`  ${type}: ${count}`);
    }
  }

  console.log('\nBy Verdict:');
  for (const [verdict, count] of Object.entries(stats?.byVerdict ?? {})) {
    if (count > 0) {
      console.log(`  ${verdict}: ${count}`);
    }
  }

  console.log('\nBy Actor Type:');
  for (const [actor, count] of Object.entries(stats?.byActorType ?? {})) {
    if (count > 0) {
      console.log(`  ${actor}: ${count}`);
    }
  }
}

// ============================================================================
// Audit Export Commands
// ============================================================================

async function exportAudit(format: string, output?: string): Promise<void> {
  const ledger = getUnifiedAuditLedger();
  await ledger.initialize();

  let data: string;

  if (format === 'jsonl') {
    data = ledger.exportToJSONL();
  } else if (format === 'json') {
    data = JSON.stringify(ledger.exportToJson(), null, 2);
  } else {
    console.error(`Error: Unknown format '${format}'`);
    console.error("Supported formats: jsonl, json");
    process.exit(1);
  }

  if (output) {
    // Write to file would require fs import - for now, just output
    console.log(data);
  } else {
    console.log(data);
  }
}

// ============================================================================
// Violations Commands
// ============================================================================

function listViolations(args: Map<string, string>): void {
  const enforcer = getCrossDomainPolicyEnforcer();

  const filters: Record<string, unknown> = {};
  if (args.has('type')) filters.type = args.get('type')!;
  if (args.has('content')) filters.contentId = args.get('content')!;
  if (args.has('action')) filters.actionId = args.get('action')!;
  if (args.has('reviewed')) filters.reviewed = args.get('reviewed') === 'true';

  const violations = enforcer.queryViolations(filters);

  if (violations.length === 0) {
    console.log('No violations match the specified filters.');
    return;
  }

  console.log(`Found ${violations.length} violations\n`);

  for (const violation of violations.slice(0, 20)) {
    printViolation(violation);
    console.log('');
  }

  if (violations.length > 20) {
    console.log(`... and ${violations.length - 20} more violations`);
  }
}

function printViolation(violation: CrossDomainViolation): void {
  console.log(`  ID:          ${violation.id}`);
  console.log(`  Type:        ${violation.type}`);
  console.log(`  Verdict:     ${violation.triggeringVerdict}`);
  console.log(`  Created:     ${violation.createdAt}`);
  console.log(`  Reviewed:    ${violation.reviewed ? 'Yes' : 'No'}`);

  if (violation.contentId) {
    console.log(`  Content:     ${violation.contentId}`);
  }
  if (violation.actionId) {
    console.log(`  Action:      ${violation.actionId}`);
  }
  if (violation.contentTrustTier) {
    console.log(`  Trust Tier:  ${violation.contentTrustTier}`);
  }
  if (violation.actionRiskLevel) {
    console.log(`  Risk Level:  ${violation.actionRiskLevel}`);
  }

  // Impact
  if (violation.impact.actionRiskElevated) {
    console.log(`  ⚠️  Action risk elevated`);
  }
  if (violation.impact.contentReviewRequired) {
    console.log(`  ⚠️  Content review required`);
  }

  // Truncate explanation
  const explanation = violation.explanation;
  if (explanation.length > 80) {
    console.log(`  Explanation: ${explanation.slice(0, 80)}...`);
  } else {
    console.log(`  Explanation: ${explanation}`);
  }
}

function showViolationStats(): void {
  const enforcer = getCrossDomainPolicyEnforcer();
  const stats = enforcer.getStats();

  console.log('Cross-Domain Violation Statistics\n');
  console.log(`Total Violations:      ${stats.total}`);
  console.log(`Pending Review:        ${stats.pendingReview}`);
  console.log(`Reviewed:              ${stats.reviewed}`);
  console.log(`Active Review Reqs:    ${stats.activeReviewRequirements}`);

  console.log('\nBy Type:');
  for (const [type, count] of Object.entries(stats.byType)) {
    if (count > 0) {
      console.log(`  ${type}: ${count}`);
    }
  }
}

// ============================================================================
// Decisions Commands
// ============================================================================

function queryDecisions(args: Map<string, string>): void {
  const engine = getGovernanceDecisionEngine();

  const filters: Record<string, unknown> = {};
  if (args.has('type')) filters.type = args.get('type')!;
  if (args.has('verdict')) filters.verdict = args.get('verdict')!;
  if (args.has('actor')) filters.actor = args.get('actor')!;
  if (args.has('project')) filters.projectId = args.get('project')!;
  if (args.has('limit')) filters.limit = parseInt(args.get('limit')!, 10);

  // Time range
  if (args.has('after')) {
    filters.after = new Date(args.get('after')!).getTime();
  }
  if (args.has('before')) {
    filters.before = new Date(args.get('before')!).getTime();
  }

  const decisions = engine.queryDecisions(filters);

  if (decisions.length === 0) {
    console.log('No decisions match the specified filters.');
    return;
  }

  console.log(`Found ${decisions.length} decisions\n`);

  for (const decision of decisions.slice(0, 20)) {
    printDecision(decision);
    console.log('');
  }

  if (decisions.length > 20) {
    console.log(`... and ${decisions.length - 20} more decisions`);
  }
}

function printDecision(decision: DecisionRecord): void {
  console.log(`  ID:          ${decision.id}`);
  console.log(`  Type:        ${decision.type}`);
  console.log(`  Verdict:     ${decision.decision.verdict}`);
  console.log(`  Confidence:  ${(decision.decision.confidence * 100).toFixed(1)}%`);
  console.log(`  Created:     ${decision.createdAt}`);
  console.log(`  Actor:       ${decision.context.actor}`);
  console.log(`  Policy:      ${decision.policyName}`);

  if (decision.context.projectId) {
    console.log(`  Project:     ${decision.context.projectId}`);
  }
  if (decision.context.phaseId) {
    console.log(`  Phase:       ${decision.context.phaseId}`);
  }

  if (decision.overridden) {
    console.log(`  ⚠️  Overridden by ${decision.overriddenBy}`);
  }

  // Missing verifications
  if (decision.decision.missingVerifications && decision.decision.missingVerifications.length > 0) {
    console.log(`  Missing:     ${decision.decision.missingVerifications.join(', ')}`);
  }

  // Truncate reasoning
  const reasoning = decision.decision.reasoning;
  if (reasoning.length > 80) {
    console.log(`  Reason:      ${reasoning.slice(0, 80)}...`);
  } else {
    console.log(`  Reason:      ${reasoning}`);
  }
}

function showDecisionStats(): void {
  const engine = getGovernanceDecisionEngine();
  const stats = engine.getStats();

  console.log('Governance Decision Statistics\n');
  console.log(`Total Decisions:       ${stats.totalDecisions}`);
  console.log(`Average Confidence:    ${(stats.averageConfidence * 100).toFixed(1)}%`);
  console.log(`Overridden:            ${stats.overriddenCount}`);
  console.log(`Last 24 Hours:         ${stats.last24Hours}`);

  console.log('\nBy Verdict:');
  for (const [verdict, count] of Object.entries(stats.byVerdict)) {
    if (count > 0) {
      console.log(`  ${verdict}: ${count}`);
    }
  }

  console.log('\nBy Type:');
  for (const [type, count] of Object.entries(stats.byType)) {
    if (count > 0) {
      console.log(`  ${type}: ${count}`);
    }
  }

  console.log('\nBy Policy:');
  for (const [policy, count] of Object.entries(stats.byPolicy)) {
    if (count > 0) {
      console.log(`  ${policy}: ${count}`);
    }
  }
}

// ============================================================================
// CLI Parser
// ============================================================================

function parseArgs(): CLIParsedArgs {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  const flags: string[] = [];
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        options.set(key, value);
      } else {
        flags.push(arg.slice(2));
      }
    } else {
      positional.push(arg);
    }
  }

  const command = (positional[0] as Command) || 'help';
  const subcommand = positional[1] || '';

  return { command, subcommand, options, flags };
}

function hasFlag(flags: string[], name: string): boolean {
  return flags.includes(name);
}

// ============================================================================
// Main CLI
// ============================================================================

function showHelp(): void {
  console.log(`
Unified Governance CLI

Inspect policies, query audit ledgers, and export governance data.

Usage: bun run unified-governance-cli.ts <command> [subcommand] [options]

Commands:
  policy list                      List available policies
  policy show <name>               Show policy details (production|strict|permissive)
  policy thresholds                Show confidence threshold matrix
  policy scan-reqs                 Show scan requirements by trust tier
  policy verify-reqs               Show verification requirements by risk level

  ledger query [filters]           Query unified audit ledger
    --type=<type>                  Filter by event type
    --subject=<id>                 Filter by subject ID
    --actor=<id>                   Filter by actor ID
    --verdict=<verdict>            Filter by verdict (approve|reject|quarantine)
    --project=<id>                 Filter by project ID
    --after=<timestamp>            Filter after timestamp (ISO or epoch ms)
    --before=<timestamp>           Filter before timestamp
    --limit=<n>                    Limit results (default: all)

  ledger stats                     Show ledger statistics

  audit export --format=<fmt>      Export audit data
    --format=jsonl                 Export as JSON Lines
    --format=json                  Export as formatted JSON
    --output=<file>                Write to file (default: stdout)

  violations list [filters]        List cross-domain violations
    --type=<type>                  Filter by violation type
    --content=<id>                 Filter by content ID
    --action=<id>                  Filter by action ID
    --reviewed=<bool>              Filter by review status

  violations stats                 Show violation statistics

  decisions query [filters]        Query governance decisions
    --type=<type>                  Filter by decision type
    --verdict=<verdict>            Filter by verdict
    --actor=<id>                   Filter by actor
    --project=<id>                 Filter by project ID
    --after=<timestamp>            Filter after timestamp
    --before=<timestamp>           Filter before timestamp
    --limit=<n>                    Limit results

  decisions stats                  Show decision statistics

  help                             Show this help message

Examples:
  bun run unified-governance-cli.ts policy show production
  bun run unified-governance-cli.ts ledger query --type=content_admission --limit=10
  bun run unified-governance-cli.ts audit export --format=jsonl > audit.jsonl
  bun run unified-governance-cli.ts violations list --reviewed=false
`);
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (hasFlag(args.flags, 'help') || hasFlag(args.flags, 'h') || args.command === 'help') {
    showHelp();
    process.exit(0);
  }

  try {
    switch (args.command) {
      case 'policy': {
        const sub = args.subcommand as PolicySubcommand;
        switch (sub) {
          case 'list':
            listPolicies();
            break;
          case 'show': {
            const name = args.options.get('name') || positionalArg(args, 2) || 'production';
            showPolicy(name);
            break;
          }
          case 'thresholds':
            showThresholds();
            break;
          case 'scan-reqs':
            showScanRequirements();
            break;
          case 'verify-reqs':
            showVerificationRequirements();
            break;
          default:
            console.error('Error: Unknown policy subcommand');
            console.error("Use: list, show, thresholds, scan-reqs, verify-reqs");
            process.exit(1);
        }
        break;
      }

      case 'ledger': {
        const sub = args.subcommand as LedgerSubcommand;
        switch (sub) {
          case 'query':
            await queryLedger(args.options);
            break;
          case 'stats':
            await showLedgerStats();
            break;
          default:
            console.error('Error: Unknown ledger subcommand');
            console.error("Use: query, stats");
            process.exit(1);
        }
        break;
      }

      case 'audit': {
        const sub = args.subcommand as AuditSubcommand;
        switch (sub) {
          case 'export': {
            const format = args.options.get('format') || 'jsonl';
            const output = args.options.get('output');
            await exportAudit(format, output);
            break;
          }
          default:
            console.error('Error: Unknown audit subcommand');
            console.error("Use: export");
            process.exit(1);
        }
        break;
      }

      case 'violations': {
        const sub = args.subcommand as ViolationsSubcommand;
        switch (sub) {
          case 'list':
            listViolations(args.options);
            break;
          case 'stats':
            showViolationStats();
            break;
          default:
            console.error('Error: Unknown violations subcommand');
            console.error("Use: list, stats");
            process.exit(1);
        }
        break;
      }

      case 'decisions': {
        const sub = args.subcommand as DecisionsSubcommand;
        switch (sub) {
          case 'query':
            queryDecisions(args.options);
            break;
          case 'stats':
            showDecisionStats();
            break;
          default:
            console.error('Error: Unknown decisions subcommand');
            console.error("Use: query, stats");
            process.exit(1);
        }
        break;
      }

      default:
        console.error(`Error: Unknown command '${args.command}'`);
        showHelp();
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('CLI error:', error);
    process.exit(1);
  }
}

// Helper to get positional argument at index
function positionalArg(args: CLIParsedArgs, index: number): string | undefined {
  // Re-parse to get full positional list
  const rawArgs = process.argv.slice(2);
  const positional: string[] = [];

  for (const arg of rawArgs) {
    if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  return positional[index];
}

// Run CLI if this file is executed directly
if (import.meta.main) {
  main();
}

export {
  // Policy commands
  listPolicies,
  showPolicy,
  showThresholds,
  showScanRequirements,
  showVerificationRequirements,
  // Ledger commands
  queryLedger,
  showLedgerStats,
  // Audit commands
  exportAudit,
  // Violations commands
  listViolations,
  showViolationStats,
  // Decisions commands
  queryDecisions,
  showDecisionStats,
  // CLI helpers
  parseArgs,
  showHelp,
};
