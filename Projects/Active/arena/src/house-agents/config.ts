export interface HouseAgentConfig {
  modelId: string;
  apiUrl: string;
  apiToken: string;
}

export function readHouseAgentConfig(env: NodeJS.ProcessEnv = process.env): HouseAgentConfig {
  const modelId = env.HOUSE_AGENT_MODEL_ID;
  const apiUrl = env.HOUSE_AGENT_API_URL;
  const apiToken = env.HOUSE_AGENT_API_TOKEN;
  if (!modelId || !apiUrl || !apiToken) {
    throw new Error("house agent config missing required env");
  }
  return { modelId, apiUrl, apiToken };
}
