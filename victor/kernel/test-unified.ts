import { VictorKernelUnified } from './victor-kernel-unified';

async function main() {
  console.log('Initializing Victor Kernel Unified...');
  const kernel = new VictorKernelUnified();
  await kernel.initialize();
  console.log('Victor Kernel Unified initialized successfully!');
  
  // Test a simple learning event
  const result = await kernel.captureDebugLearning(
    new Error('Test error - initialization check'),
    { phase: 'Debug', stack: ['Test'] },
    { projectId: 'test-project', sessionId: 'test-session' }
  );
  console.log('Test learning packet created:', result.id);
}

main().catch(console.error);
