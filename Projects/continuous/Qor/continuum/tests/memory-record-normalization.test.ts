import { describe, expect, it } from "bun:test";

import { normalizeMemoryText, parseMemoryText } from "../src/ingest/memory-to-graph";

describe("memory record normalization", () => {
  it("repairs malformed victor structured records with misplaced content fields", () => {
    const broken = `{"id":"victor-heartbeat-1","type":"observation","agent":"victor","content":{"raw":"ok","processed":"still ok"}, "entities":["Victor"], "sentiment":0, "tone":["neutral"]}, "engagement": {}, "provenance":{"createdAt":1744047000000,"source":"victor-heartbeat","sessionId":"vhb-test","platformPostId":null}}`;
    const [record] = parseMemoryText(broken, ".json") as Array<any>;

    expect(record.agent).toBe("victor");
    expect(record.content.entities).toEqual(["Victor"]);
    expect(record.content.sentiment).toBe(0);
    expect(record.content.tone).toEqual(["neutral"]);
    expect(record.type).toBe("observation");
  });

  it("repairs shell date placeholders in qora records", () => {
    const broken = `{
      "id": "qora-1",
      "type": "observation",
      "content": "ok",
      "metadata": {
        "source": "qora-moltbook",
        "sessionId": "qmb-$(date +%Y%m%d%H%M%S)",
        "timestamp": "2026-04-07T21:03:17Z"
      },
      "provenance": {
        "createdAt": $(date +%s)000,
        "source": "qora-moltbook",
        "sessionId": "qmb-$(date +%Y%m%d%H%M%S)"
      }
    }`;

    const normalized = normalizeMemoryText(broken);
    expect(normalized.includes("$(date")).toBe(false);

    const [record] = parseMemoryText(broken, ".json") as Array<any>;
    expect(record.provenance.createdAt).toBeNumber();
    expect(String(record.provenance.sessionId).startsWith("qmb-")).toBe(true);
  });

  it("repairs template placeholders and trailing invoke markers", () => {
    const broken = `{"id":"victor-\${hash}","type":"observation","agent":"victor","content":{"raw":"ok"},"provenance":{"createdAt":\${timestamp},"source":"victor-heartbeat","sessionId":"\${session_id}"}}\n</invoke>`;
    const [record] = parseMemoryText(broken, ".json") as Array<any>;

    expect(record.id.includes("${hash}")).toBe(false);
    expect(record.provenance.createdAt).toBeNumber();
    expect(String(record.provenance.sessionId).startsWith("session-")).toBe(true);
  });

  it("truncates trailing heredoc markers and shell pipelines", () => {
    const broken = `{
      "id": "victor-$(echo $(date +%s) | sha256sum | cut -c1-12)",
      "type": "observation",
      "agent": "victor",
      "content": { "raw": "ok" },
      "provenance": {
        "createdAt": $(date +%s%N | cut -b1-13),
        "source": "victor-heartbeat",
        "sessionId": "vhb-2026-04-05-0455"
      }
    }
    EOF && echo "Memory record written"`;

    const [record] = parseMemoryText(broken, ".json") as Array<any>;
    expect(record.id.includes("$(")).toBe(false);
    expect(record.provenance.createdAt).toBeNumber();
  });

  it("repairs a stray quote after the tone array in structured heartbeat records", () => {
    const broken = `{"id": "victor-vhb-2026-04-05-17-05", "type": "observation", "agent": "victor", "content": {"raw": "ok", "processed": "still ok", "entities": ["neo4j"], "sentiment": 0.7, "tone": ["factual", "alert"]}", "engagement": {}, "provenance": {"createdAt": 1775408896908, "source": "victor-heartbeat", "sessionId": "vhb-2026-04-05-17-05", "platformPostId": null}}`;

    const [record] = parseMemoryText(broken, ".json") as Array<any>;
    expect(record.content.tone).toEqual(["factual", "alert"]);
    expect(record.engagement).toEqual({});
  });

  it("repairs shell substitutions embedded in quoted ids", () => {
    const broken = `{"id": "victor-$(date +%s | md5sum | head -c 8)", "type": "observation", "agent": "victor", "content": {"raw": "ok"}, "engagement": {}, "provenance": {"createdAt": $(date +%s)000, "source": "victor-heartbeat", "sessionId": "vhb-2026-04-03-22-15", "platformPostId": null}}`;

    const [record] = parseMemoryText(broken, ".json") as Array<any>;
    expect(record.id.startsWith("victor-")).toBe(true);
    expect(record.id.includes("$(")).toBe(false);
    expect(record.provenance.createdAt).toBeNumber();
  });

  it("escapes human quotes embedded inside raw content fields", () => {
    const broken = `{
      "id": "victor-vhb-2026-04-06-175500",
      "type": "observation",
      "agent": "victor",
      "content": {
        "raw": "Forge plan includes ("Complete Forge Realization") as a quoted title",
        "processed": "ok",
        "entities": ["Forge"],
        "sentiment": 0.75,
        "tone": ["observational"]
      },
      "engagement": {},
      "provenance": {
        "createdAt": 1743969300000,
        "source": "victor-heartbeat",
        "sessionId": "vhb-2026-04-06-175500",
        "platformPostId": null
      }
    }`;

    const [record] = parseMemoryText(broken, ".json") as Array<any>;
    expect(record.content.raw.includes('\\"')).toBe(false);
    expect(record.content.raw.includes('"Complete Forge Realization"')).toBe(true);
  });
});
