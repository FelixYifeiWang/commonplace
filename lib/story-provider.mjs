import {
  STORY_MODEL,
  storySchema,
  storyInstructions,
  validateStoryOutput,
  sessionSchema,
  sessionInstructions,
  validateSession,
  sessionURLs,
  normalizeSession,
} from "./story.mjs";

const RETRY_HINT =
  "\nA previous attempt failed source validation. Copy evidence quotes verbatim from the exact sourceId you choose. Use short quotes, preserve wording and punctuation, and use only IDs present in this input.";
// The validator's messages are fixed rule descriptions, so they are safe to show the model on the retry.
const retryHint = (rejection) =>
  `${RETRY_HINT}\nThe previous attempt was rejected: ${rejection} Fix that and keep every other rule.`;

// One structured-output request with the shared safeguards: no tools, no provider storage, credentials
// never echoed in errors, and one retry when the response fails validation.
async function requestStructured({
  input,
  instructions,
  schema,
  name,
  maxTokens,
  validate,
  apiKey,
  transport = fetch,
  signal,
}) {
  if (!apiKey)
    throw new Error("Add an OpenAI API key to .env.local to write stories.");
  const deadline = signal || AbortSignal.timeout(120000);
  let rejection = "";
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
          instructions: instructions + (attempt ? retryHint(rejection) : ""),
          input: JSON.stringify(input),
          reasoning: { effort: "low" },
          max_output_tokens: maxTokens,
          text: {
            format: { type: "json_schema", name, strict: true, schema },
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
      return validate(parsed);
    } catch (error) {
      if (attempt) throw error;
      rejection = error instanceof Error ? error.message : "";
    }
  }
}

/** @param {any} input
 * @param {{apiKey?: string, transport?: typeof fetch, signal?: AbortSignal}} options
 */
export async function generateStory(input, options = {}) {
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
  return requestStructured({
    ...options,
    input,
    instructions: storyInstructions,
    schema,
    name: "channel_story",
    maxTokens: 3000,
    validate: (parsed) => validateStoryOutput(parsed, input),
  });
}

// The whole story (at most five steps) and the gallery, revised together from the current version.
// Item and source IDs are limited to the ones in this input, so the model cannot point at anything else.
/** @param {any} input
 * @param {{apiKey?: string, transport?: typeof fetch, signal?: AbortSignal}} options
 */
export async function generateSession(input, options = {}) {
  const schema = structuredClone(sessionSchema);
  const mediaIds = input.media.map((item) => item.id);
  const sourceIds = [
    ...new Set([...input.transcript.map((turn) => turn.id), ...mediaIds]),
  ];
  const step = schema.properties.steps.items.properties;
  const node = schema.properties.map.properties.nodes.items.properties;
  const detail = node.details.items.properties;
  const center = schema.properties.map.properties.center.properties;
  const urls = sessionURLs(input);
  for (const field of [center.url, node.url, detail.url]) {
    if (urls.length) field.anyOf[0].enum = urls;
    else field.anyOf = [{ type: "null" }];
  }
  const itemFields = [center.itemId, node.itemId, detail.itemId];
  if (mediaIds.length) {
    step.canvas.properties.items.items.properties.itemId.enum = mediaIds;
    for (const field of itemFields) field.anyOf[0].enum = mediaIds;
  } else {
    step.canvas.properties.items.maxItems = 0;
    for (const field of itemFields) field.anyOf = [{ type: "null" }];
  }
  if (sourceIds.length) {
    step.evidence.items.properties.sourceId.enum = sourceIds;
    step.canvas.properties.quote.anyOf[0].properties.sourceId.enum = sourceIds;
    node.evidence.properties.sourceId.enum = sourceIds;
    detail.evidence.properties.sourceId.enum = sourceIds;
  }
  return requestStructured({
    ...options,
    input,
    instructions: sessionInstructions,
    schema,
    name: "channel_session",
    maxTokens: 6000,
    validate: (parsed) =>
      validateSession(normalizeSession(parsed, input), input),
  });
}
