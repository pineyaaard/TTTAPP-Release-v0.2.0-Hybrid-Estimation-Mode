import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse } from "@google/genai";

export async function generateContentWithRetry(
  apiKey: string,
  params: GenerateContentParameters,
  maxRetries = 3
): Promise<GenerateContentResponse> {
  const ai = new GoogleGenAI({ apiKey });
  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await ai.models.generateContent(params);
      return response;
    } catch (err: any) {
      lastError = err;
      const isQuotaError = err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED');
      
      if (isQuotaError && i < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
