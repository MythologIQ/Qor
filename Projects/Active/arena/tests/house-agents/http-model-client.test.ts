import { describe, expect, test } from "bun:test";
import { HttpHouseModelClient } from "../../src/house-agents/http-model-client.ts";

describe("HttpHouseModelClient", () => {
  test("sends configured model id", async () => {
    let body = "";
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ output: "{\"bid\":0,\"extras\":[]}" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const client = new HttpHouseModelClient(
      {
        modelId: "house-default",
        apiUrl: "https://example.test/llm",
        apiToken: "secret",
      },
      fetchImpl,
    );

    await client.complete({
      tier: "starter",
      prompt: "hello",
      state: {} as never,
      budget: {} as never,
      policyPack: { id: "starter-v1" } as never,
    });

    expect(body).toContain("\"model\":\"house-default\"");
  });

  test("rejects non-200 responses", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const client = new HttpHouseModelClient(
      {
        modelId: "house-default",
        apiUrl: "https://example.test/llm",
        apiToken: "secret",
      },
      fetchImpl,
    );

    await expect(
      client.complete({
        tier: "starter",
        prompt: "hello",
        state: {} as never,
        budget: {} as never,
        policyPack: { id: "starter-v1" } as never,
      }),
    ).rejects.toThrow("house model request failed: 500");
  });
});
