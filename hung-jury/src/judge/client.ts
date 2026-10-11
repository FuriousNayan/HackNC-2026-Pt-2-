import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { JUDGE_CONFIG as C } from '@/contracts';
import { responseJsonSchema } from './schema';
export class ProviderSafetyError extends Error {}
export interface GenerateRequest {
  system: string;
  prompt: string;
  signal: AbortSignal;
  schema?: unknown;
}
export type Generate = (request: GenerateRequest) => Promise<string>;
export function createGeminiGenerator(apiKey: string, model: string): Generate {
  // Own retry loop below controls the maximum number of requests.
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: 1 }, timeout: C.timeoutMs },
  });
  return async ({ system, prompt, signal, schema }) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseJsonSchema: schema ?? responseJsonSchema,
        temperature: C.temperature,
        maxOutputTokens: C.maxOutputTokens,
        abortSignal: signal,
        ...(model.startsWith('gemini-3')
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
      },
    });
    const blocked =
      response.promptFeedback?.blockReason ||
      response.candidates?.some((c) =>
        ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY'].includes(
          String(c.finishReason),
        ),
      );
    if (blocked) throw new ProviderSafetyError('Provider blocked this content');
    if (!response.text?.trim()) throw new Error('Empty provider response');
    return response.text;
  };
}
