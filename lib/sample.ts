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
