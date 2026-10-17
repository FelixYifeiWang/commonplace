import test from "node:test";
import assert from "node:assert/strict";
import { generateStory } from "../lib/story-provider.mjs";
const input = { transcript: [], media: [] };
test("uses exactly GPT-6 Luna, structured output, no tools and no provider storage", async () => {
  let body;
  await generateStory(input, {
    apiKey: "test-only",
    transport: async (_url, opts) => {
      body = JSON.parse(opts.body);
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"beats":[]}' }],
          },
        ],
      });
    },
  });
  assert.equal(body.model, "gpt-6-luna");
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.equal(body.tools, undefined);
});
test("provider credentials and raw error bodies never reach the UI error", async () => {
  await assert.rejects(
    generateStory(input, {
      apiKey: "test-only",
      transport: async () =>
        new Response("secret upstream diagnostics", { status: 401 }),
    }),
    (e) => e.message.includes("rejected") && !e.message.includes("secret"),
  );
});
test("incomplete provider results do not advance a story", async () => {
  await assert.rejects(
    generateStory(input, {
      apiKey: "test-only",
      transport: async () =>
        Response.json({ status: "incomplete", output: [] }),
    }),
    /incomplete/,
  );
});

test("transport diagnostics cannot expose the credential", async () => {
  await assert.rejects(
    generateStory(input, {
      apiKey: "private-value",
      transport: async () => {
        throw new Error("Invalid header private-value");
      },
    }),
    (error) =>
      !error.message.includes("private-value") &&
      error.message.includes("OpenAI"),
  );
});

test("retries ungrounded evidence once, with source IDs constrained", async () => {
  const source = {
    transcript: [{ id: "turn-1", text: "Use a quiet\nlayout." }],
    media: [],
  };
  let calls = 0;
  const result = await generateStory(source, {
    apiKey: "test-only",
    transport: async (_url, options) => {
      calls++;
      const body = JSON.parse(options.body);
      assert.deepEqual(
        body.text.format.schema.properties.beats.items.properties.evidence.items
          .properties.sourceId.enum,
        ["turn-1"],
      );
      const beats = [
        {
          title: "Quiet layout",
          text: "A quiet layout becomes the direction.",
          connections: [],
          evidence: [
            {
              sourceId: "turn-1",
              quote: calls === 1 ? "Invented decision" : "Use a quiet layout.",
            },
          ],
        },
      ];
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify({ beats }) }],
          },
        ],
      });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.length, 1);
});
