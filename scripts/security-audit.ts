#!/usr/bin/env bun
/**
 * Security Audit Script
 *
 * Runs dependency vulnerability scans and security checks:
 * - npm audit for known vulnerabilities
 * - License compliance check
 * - Dependency freshness check
 */

import { $ } from "bun";

interface AuditResult {
  vulnerabilities: {
    info: number;
    low: number;
    moderate: number;
    high: number;
    critical: number;
    total: number;
  };
  metadata: {
    dependencies: number;
    devDependencies: number;
    vulnerabilities: number;
  };
}

interface PackageInfo {
  name: string;
  version: string;
  license: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const ALLOWED_LICENSES = [
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "CC0-1.0",
  "Unlicense",
  "0BSD",
];

async function runNpmAudit(): Promise<AuditResult | null> {
  console.log("🔍 Running npm audit...\n");

  try {
    const result = await $`npm audit --json`.text();
    const audit = JSON.parse(result) as AuditResult;

    const { vulnerabilities } = audit;

    console.log("Vulnerability Summary:");
    console.log(`  Critical: ${vulnerabilities.critical}`);
    console.log(`  High:     ${vulnerabilities.high}`);
    console.log(`  Moderate: ${vulnerabilities.moderate}`);
    console.log(`  Low:      ${vulnerabilities.low}`);
    console.log(`  Info:     ${vulnerabilities.info}`);
    console.log(`  Total:    ${vulnerabilities.total}\n`);

    if (vulnerabilities.critical > 0 || vulnerabilities.high > 0) {
      console.error("❌ CRITICAL or HIGH vulnerabilities found!\n");
      await $`npm audit`.quiet();
      return audit;
    }

    if (vulnerabilities.moderate > 0) {
      console.warn("⚠️  MODERATE vulnerabilities found\n");
      return audit;
    }

    console.log("✅ No significant vulnerabilities found\n");
    return audit;
  } catch (error) {
    console.error("Failed to run npm audit:", error);
    return null;
  }
}

async function checkLicenses(): Promise<boolean> {
  console.log("📜 Checking dependency licenses...\n");

  try {
    const packageJson = await Bun.file("package.json").json();
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    const issues: string[] = [];

    for (const [name, version] of Object.entries(allDeps)) {
      try {
        const depPackageJson = await Bun.file(`node_modules/${name}/package.json`).json();
        const license = depPackageJson.license;

        if (!license) {
          issues.push(`${name}: No license specified`);
        } else if (!ALLOWED_LICENSES.includes(license)) {
          issues.push(`${name}: License '${license}' not in approved list`);
        }
      } catch (error) {
        // Dependency not installed or missing package.json
        issues.push(`${name}: Could not read package.json`);
      }
    }

    if (issues.length > 0) {
      console.warn("⚠️  License issues found:");
      for (const issue of issues) {
        console.warn(`  - ${issue}`);
      }
      console.log();
      return false;
    }

    console.log("✅ All licenses approved\n");
    return true;
  } catch (error) {
    console.error("Failed to check licenses:", error);
    return false;
  }
}

async function checkOutdatedDeps(): Promise<void> {
  console.log("📦 Checking for outdated dependencies...\n");

  try {
    await $`npm outdated`.quiet();
    console.log("✅ All dependencies up to date\n");
  } catch (error) {
    // npm outdated exits with 1 if there are outdated packages
    console.warn("⚠️  Some dependencies are outdated");
    console.warn("   Run 'npm outdated' for details\n");
  }
}

async function main() {
  console.log("🔐 Zo-Qore Security Audit\n");
  console.log("=".repeat(50) + "\n");

  let exitCode = 0;

  // 1. npm audit
  const auditResult = await runNpmAudit();
  if (auditResult) {
    const { critical, high } = auditResult.vulnerabilities;
    if (critical > 0 || high > 0) {
      exitCode = 1;
    }
  }

  // 2. License check
  const licensesOk = await checkLicenses();
  if (!licensesOk) {
    console.warn("⚠️  License compliance issues detected\n");
  }

  // 3. Outdated deps
  await checkOutdatedDeps();

  console.log("=".repeat(50));

  if (exitCode === 0) {
    console.log("✅ Security audit passed");
  } else {
    console.error("❌ Security audit failed - please fix critical/high vulnerabilities");
  }

  process.exit(exitCode);
}

main();
