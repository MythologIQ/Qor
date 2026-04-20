import { describe, expect, it } from 'bun:test';

import { EVALUATION_CASES, runEvaluationSuite } from './evaluate';

describe('memory evaluation harness', () => {
  it('passes the benchmark suite for recall, contradictions, insufficient evidence, and stale cache rejection', async () => {
    const report = await runEvaluationSuite();

    expect(report.total).toBe(EVALUATION_CASES.length);
    expect(report.failed).toBe(0);
    expect(report.results.every((result) => result.passed)).toBe(true);
  });
});
