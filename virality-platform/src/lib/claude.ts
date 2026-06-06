import { generateConcepts } from "./gemini";

export async function generateNewConcepts(
  videoAnalysis: string,
  newConceptsPrompt: string
): Promise<string> {
  return generateConcepts(videoAnalysis, newConceptsPrompt);
}
