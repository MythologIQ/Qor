import { readHouseAgentConfig } from "./config.ts";
import type { HouseModelClient, HouseModelRequest, HouseModelResponse } from "./types.ts";

export class HttpHouseModelClient implements HouseModelClient {
  constructor(
    private readonly config = readHouseAgentConfig(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(request: HouseModelRequest): Promise<HouseModelResponse> {
    const response = await this.fetchImpl(this.config.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${this.config.apiToken}`,
      },
      body: JSON.stringify({
        model: this.config.modelId,
        input: request.prompt,
        metadata: {
          tier: request.tier,
          policyPackId: request.policyPack.id,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`house model request failed: ${response.status}`);
    }
    const data = await response.json() as { output?: string };
    if (!data.output) {
      throw new Error("house model response missing output");
    }
    return { text: data.output };
  }
}
