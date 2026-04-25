import { queueAgent, findOpponent, getQueueStatus } from './src/orchestrator/matchmaker.ts';
import { createOperator } from './src/storage/operators.ts';
import { registerAgent } from './src/storage/agents.ts';
import { getDb } from './src/storage/db.ts';

const db = getDb();
db.exec("DELETE FROM match_records");
db.exec("DELETE FROM agent_versions");
db.exec("DELETE FROM operators");

const { operator: op1 } = createOperator("op-2-enqueue-1");
const { operator: op2 } = createOperator("op-2-enqueue-2");
const { agent: ag1 } = registerAgent(op1.id, "BobAgent", "fp-bob", "qwen2.5-14b");
const { agent: ag2 } = registerAgent(op2.id, "CarolAgent", "fp-carol", "llama-70b");

console.log("DB IDs - ag1:", ag1.id, "ag2:", ag2.id);
console.log("ag1 bracket:", ag1.bracket, "ag2 bracket:", ag2.bracket);

queueAgent(ag1.id, "apex");
queueAgent(ag2.id, "apex");

const status = getQueueStatus();
console.log("Queue status after enqueuing:", JSON.stringify(status));

const opp = findOpponent(ag1.id, "apex");
console.log("findOpponent(ag1.id, 'apex'):", opp?.id ?? "null");
