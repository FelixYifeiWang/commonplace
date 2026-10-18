import type { WorkspaceData, Item } from "./types";
const createdAt = "2026-10-17T14:00:00.000Z";
const base = {
  collectionId: "c1",
  sessionId: null,
  url: null,
  imageUrl: null,
  sourceRole: "user",
  sourceTurn: "",
  inferred: false,
  createdAt,
  updatedAt: createdAt,
  sourceText: "Example content. Not imported from a connected session.",
};
export const SAMPLE: WorkspaceData = {
  user: { displayName: "Example", email: "" },
  devices: [],
  collections: [{ id: "c1", name: "Untitled", description: "", createdAt }],
  sessions: [],
  items: [
    {
      ...base,
      id: "i1",
      kind: "link",
      title: "Are.na",
      body: "",
      url: "https://www.are.na/",
    },
    {
      ...base,
      id: "i2",
      kind: "image",
      title: "Interior",
      body: "",
      url: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1000&auto=format&fit=crop&q=85",
      imageUrl:
        "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1000&auto=format&fit=crop&q=85",
    },
    {
      ...base,
      id: "i3",
      kind: "link",
      title: "Linear",
      body: "",
      url: "https://linear.app/",
    },
    {
      ...base,
      id: "i4",
      kind: "link",
      title: "Notion",
      body: "",
      url: "https://www.notion.com/",
    },
    {
      ...base,
      id: "i5",
      kind: "image",
      title: "Forest",
      body: "",
      url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=900&auto=format&fit=crop&q=85",
      imageUrl:
        "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=900&auto=format&fit=crop&q=85",
    },
  ] as Item[],
};

// Curated example, never presented as an imported conversation.
export const SAMPLE_SESSION: import("./session-types").SessionDocument = {
  steps: [
    {
      title: "Leave room to think",
      text: "I started with a room that felt calm. Plenty of space between objects, warm surfaces, and nothing competing for attention. I wanted the workspace to feel that way too.",
      canvas: {
        layout: "reference",
        items: [{ itemId: "i2", role: "reference", label: "Room to think" }],
        quote: null,
      },
      evidence: [
        { sourceId: "example", quote: "Plenty of space between objects." },
      ],
    },
    {
      title: "Keep the connections",
      text: "Are.na gave me the starting point: collect things without forcing them into folders. The relationships should grow as I work, with each source keeping its own character.",
      canvas: {
        layout: "reference",
        items: [
          { itemId: "i1", role: "reference", label: "Are.na" },
          { itemId: "i5", role: "reference", label: "Room to grow" },
        ],
        quote: null,
      },
      evidence: [
        {
          sourceId: "example",
          quote: "Collect things without forcing them into folders.",
        },
      ],
    },
  ],
  map: {
    center: { label: "A space for ideas", itemId: null, url: null },
    nodes: [
      {
        label: "Breathing room",
        kind: "principle",
        weight: "major",
        summary: "Space between objects gives each idea room.",
        itemId: "i2",
        url: null,
        font: null,
        evidence: {
          sourceId: "example",
          quote: "Plenty of space between objects.",
        },
        details: [
          {
            label: "Quiet surfaces",
            itemId: null,
            url: null,
            evidence: {
              sourceId: "example",
              quote: "Warm surfaces, nothing competing for attention.",
            },
          },
        ],
      },
      {
        label: "Are.na",
        kind: "reference",
        weight: "normal",
        summary: "Keep sources intact and let connections grow.",
        itemId: "i1",
        url: "https://www.are.na/",
        font: null,
        evidence: {
          sourceId: "example",
          quote: "Collect things without forcing them into folders.",
        },
        details: [],
      },
      {
        label: "Organic connections",
        kind: "idea",
        weight: "normal",
        summary: "Relationships emerge while you work.",
        itemId: "i5",
        url: null,
        font: null,
        evidence: {
          sourceId: "example",
          quote: "The relationships should grow as I work.",
        },
        details: [
          {
            label: "Keep each source",
            itemId: null,
            url: null,
            evidence: {
              sourceId: "example",
              quote: "Each source keeps its own character.",
            },
          },
        ],
      },
    ],
  },
};
