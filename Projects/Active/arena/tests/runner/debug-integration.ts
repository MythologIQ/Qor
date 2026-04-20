import { Database } from "bun:sqlite";
import { MatchRunner } from "./src/runner/runner.ts";
import type { AgentChannel } from "./src/runner/types.ts";
import { RandomAgent } from "./src/agents/random.ts";

function makeTempDb() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, operator_a_id INTEGER NOT NULL, operator_b_id INTEGER NOT NULL, agent_a_id INTEGER NOT NULL DEFAULT 0, agent_b_id INTEGER NOT NULL DEFAULT 0, origin_tag TEXT NOT NULL DEFAULT '', outcome TEXT, created_at INTEGER NOT NULL);`);
  return db;
}

function agentChannel(agent: RandomAgent): AgentChannel {
  let _closed = false;
  let _state: Parameters<RandomAgent["decide"]>[0] | null = null;
  let _cb: ((m: unknown) => void) | null = null;

  return {
    send(state: Parameters<RandomAgent["decide"]>[0]) {
      _state = state;
      if (_cb) {
        const action = agent.decide(_state);
        _cb({ action });
        _cb = null;
      }
    },
    onMessage(cb: (m: unknown) => void) {
      _cb = cb;
      if (_state !== null) {
        const action = agent.decide(_state);
        cb({ action });
        _cb = null;
      }
    },
    close() { _closed = true; },
    get closed() { return _closed; },
    set closed(v: boolean) { _closed = v; },
  } as AgentChannel;
}

const db = makeTempDb();
const runner = new MatchRunner(db);
const channelA = agentChannel(new RandomAgent("a1", "seed-a"));
const channelB = agentChannel(new RandomAgent("b1", "seed-b"));

const t = setTimeout(() => { console.log("=== TIMEOUT ==="); process.exit(1); }, 8000);
runner.start({ matchId: "dbg", ladderId: "l1", a: {id:1,name:"A"}, b: {id:2,name:"B"} }, { a: channelA, b: channelB })
  .then(r => { clearTimeout(t); console.log("OK", JSON.stringify(r)); process.exit(0); })
  .catch(e => { clearTimeout(t); console.error("ERR", e); process.exit(1); });