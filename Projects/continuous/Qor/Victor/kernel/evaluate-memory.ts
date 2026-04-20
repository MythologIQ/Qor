import { runEvaluationSuite } from './memory/evaluate';

const report = await runEvaluationSuite();

for (const result of report.results) {
  const prefix = result.passed ? 'PASS' : 'FAIL';
  console.log(`${prefix} ${result.id} :: ${result.description}`);
  for (const failure of result.failures) {
    console.log(`  - ${failure}`);
  }
}

console.log(
  JSON.stringify(
    {
      total: report.total,
      passed: report.passed,
      failed: report.failed,
    },
    null,
    2,
  ),
);

if (report.failed > 0) {
  process.exit(1);
}
