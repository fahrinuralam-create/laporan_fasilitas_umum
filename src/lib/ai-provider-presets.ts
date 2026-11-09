export type ProviderPreset = {
  id: string;
  label: string;
  baseUrl: string;
  textModels: string[];
  visionModels: string[];
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    textModels: [
      "nvidia/nemotron-3.5-lightning-30b-a3b",
      "meta/llama-3.1-70b-instruct",
      "meta/llama-3.2-11b-vision-instruct",
    ],
    visionModels: [
      "nvidia/nemotron-3.5-super-vl-120b-a12b",
      "meta/llama-3.2-11b-vision-instruct",
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    textModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
    visionModels: ["gpt-4o-mini", "gpt-4o"],
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    textModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    visionModels: ["meta-llama/llama-4-scout-17b-16e-instruct"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    textModels: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet"],
    visionModels: ["openai/gpt-4o-mini"],
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    baseUrl: "",
    textModels: [],
    visionModels: [],
  },
];

export function findPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}
