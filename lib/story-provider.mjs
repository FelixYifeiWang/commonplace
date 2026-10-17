import {
  STORY_MODEL,
  storySchema,
  storyInstructions,
  validateStoryOutput,
} from "./story.mjs";
/** @param {any} input
 * @param {{apiKey?: string, transport?: typeof fetch, signal?: AbortSignal}} options
 */
export async function generateStory(
  input,
  { apiKey, transport = fetch, signal } = {},
) {
  if (!apiKey)
    throw new Error("Add an OpenAI API key to .env.local to write stories.");
  const deadline = signal || AbortSignal.timeout(120000);
  const schema = structuredClone(storySchema);
  const properties = schema.properties.beats.items.properties;
  const mediaIds = input.media.map((item) => item.id);
  const sourceIds = [
    ...new Set([...input.transcript.map((turn) => turn.id), ...mediaIds]),
  ];
  if (mediaIds.length)
    properties.connections.items.properties.itemId.enum = mediaIds;
  else properties.connections.maxItems = 0;
  if (sourceIds.length)
    properties.evidence.items.properties.sourceId.enum = sourceIds;
  else schema.properties.beats.maxItems = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await transport("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: deadline,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: STORY_MODEL,
          store: false,
          instructions:
            storyInstructions +
            (attempt
              ? "\nA previous attempt failed source validation. Copy evidence quotes verbatim from the exact sourceId you choose. Use short quotes, preserve wording and punctuation, and use only IDs present in this input."
              : ""),
          input: JSON.stringify(input),
          reasoning: { effort: "low" },
          max_output_tokens: 3000,
          text: {
            format: {
              type: "json_schema",
              name: "channel_story",
              strict: true,
              schema,
            },
          },
        }),
      });
    } catch {
      throw new Error("Could not reach OpenAI. Retry to continue.");
    }
    if (!response.ok) {
      if (response.status === 401)
        throw new Error(
          "OpenAI rejected the API key. Update .env.local, then retry.",
        );
      if (response.status === 429)
        throw new Error(
          "OpenAI usage or rate limit reached. Check your API billing, then retry.",
        );
      if (response.status === 403 || response.status === 404)
        throw new Error("GPT-6 Luna is unavailable for this API project.");
      throw new Error(
        `Story generation is unavailable (OpenAI ${response.status}).`,
      );
    }
    const result = await response.json();
    if (result.status !== "completed")
      throw new Error(
        "The story was incomplete. Earlier beats are unchanged; retry to continue.",
      );
    const output = (result.output || [])
      .flatMap((o) => (o.type === "message" ? o.content || [] : []))
      .filter((c) => c.type === "output_text")
      .map((c) => c.text)
      .join("");
    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      throw new Error(
        "The story response could not be read. Retry to continue.",
      );
    }
    try {
      return validateStoryOutput(parsed, input);
    } catch (error) {
      if (attempt) throw error;
    }
  }
}
