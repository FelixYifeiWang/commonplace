import {
  excerptCatalog,
  hydrateEvidence,
  recoverSession,
} from "./session-recovery.mjs";
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
const retryHint = (rejection, hint) =>
  `${hint}\nThe previous attempt was rejected: ${rejection} Fix that and keep every other rule.`;

// One structured-output request with the shared safeguards: no tools, no provider storage, credentials
// never echoed in errors, and one retry when the response fails validation.
async function requestStructured({
  input,
  instructions,
  schema,
  name,
  maxTokens,
  validate,
  recover,
  retryInstructions = RETRY_HINT,
  apiKey,
  transport = fetch,
  signal,
}) {
  if (!apiKey)
    throw new Error("Add an OpenAI API key to .env.local to write stories.");
  const deadline = signal || AbortSignal.timeout(120000);
  let rejection = "";
  let partial = null;
  const failure = (message) => Object.assign(new Error(message), { partial });
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
            instructions +
            (attempt ? retryHint(rejection, retryInstructions) : ""),
          input: JSON.stringify(
            partial ? { ...input, validatedDraft: partial } : input,
          ),
          reasoning: { effort: "low" },
          max_output_tokens: maxTokens,
          text: {
            format: { type: "json_schema", name, strict: true, schema },
          },
        }),
      });
    } catch {
      throw failure("Could not reach OpenAI. Retry to continue.");
    }
    if (!response.ok) {
      if (response.status === 401)
        throw failure(
          "OpenAI rejected the API key. Update .env.local, then retry.",
        );
      if (response.status === 429)
        throw failure(
          "OpenAI usage or rate limit reached. Check your API billing, then retry.",
        );
      if (response.status === 403 || response.status === 404)
        throw failure("GPT-6 Luna is unavailable for this API project.");
      throw failure(
        `Story generation is unavailable (OpenAI ${response.status}).`,
      );
    }
    const result = await response.json();
    if (result.status !== "completed")
      throw failure(
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
      throw failure("The story response could not be read. Retry to continue.");
    }
    try {
      return validate(parsed);
    } catch (error) {
      rejection =
        error instanceof Error ? error.message : "Invalid session response.";
      const recovered = recover?.(parsed);
      if (recovered) partial = recovered;
      if (attempt) {
        const failure = new Error("Couldn’t verify the sources. Try again.");
        // Store the failed rule, never source text or credentials.
        failure.diagnostic =
          "Source validation: " +
          (rejection.startsWith("Canvas row ")
            ? "Canvas row is not grounded in the session."
            : rejection.startsWith("The evidence quote from ")
              ? "Evidence quote is not present in its source."
              : rejection
          )
            .replace(/"[^"]*"/g, "[text]")
            .replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi, "[source]")
            .slice(0, 400);
        failure.partial = partial;
        throw failure;
      }
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
    step.canvas.properties.words.anyOf[0].properties.rows.items.properties.sourceId.enum =
      sourceIds;
    node.evidence.properties.sourceId.enum = sourceIds;
    detail.evidence.properties.sourceId.enum = sourceIds;
  }
  const excerpts = excerptCatalog(input);
  const evidence = {
    type: "object",
    additionalProperties: false,
    required: ["excerptId"],
    properties: {
      excerptId: {
        type: "string",
        ...(excerpts.length <= 400
          ? { enum: excerpts.length ? excerpts.map((e) => e.id) : ["none"] }
          : { pattern: "^e[0-9]+$" }),
      },
    },
  };
  schema.$defs = { evidence };
  step.evidence.items = { $ref: "#/$defs/evidence" };
  node.evidence = { $ref: "#/$defs/evidence" };
  detail.evidence = { $ref: "#/$defs/evidence" };
  const hydrate = (parsed) => hydrateEvidence(parsed, excerpts);
  return requestStructured({
    ...options,
    input: { ...input, excerpts },
    instructions:
      sessionInstructions +
      "\nEVIDENCE FORMAT: Select excerptId from excerpts for every evidence field. The server inserts the original quote and sourceId. Never invent an excerpt ID. Canvas line text still copies source text exactly. If validatedDraft is present, retain its verified sections and fix only missing or invalid parts. Keep existing wording unless new evidence changes it.",
    schema,
    name: "channel_session",
    retryInstructions:
      "\nChoose evidence by excerptId from the supplied catalog. Keep validatedDraft sections and repair the rejected rule. Never invent an excerpt ID or quote.",
    maxTokens: 6000,
    validate: (parsed) => {
      const value = hydrate(parsed);
      try {
        return validateSession(normalizeSession(value, input), input, {
          strictPresentation: false,
        });
      } catch (error) {
        const repaired = recoverSession(value, input);
        // A cosmetic canvas failure is repairable. Never silently accept lost claims.
        if (
          repaired &&
          repaired.steps.length === value.steps?.length &&
          repaired.map.nodes.length === value.map?.nodes?.length &&
          repaired.map.nodes.every(
            (n, i) => n.details.length === value.map.nodes[i].details.length,
          )
        )
          return repaired;
        throw error;
      }
    },
    recover: (parsed) => {
      try {
        return recoverSession(hydrate(parsed), input);
      } catch {
        return null;
      }
    },
  });
}
