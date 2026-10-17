export type ItemKind =
  | "link"
  | "image"
  | "video"
  | "idea"
  | "quote"
  | "note"
  | "audio"
  | "document"
  | "file";
export type SessionState =
  | "waiting"
  | "reading"
  | "collecting"
  | "connecting"
  | "following"
  | "paused"
  | "complete"
  | "error"
  | "revoked";
export type Collection = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
};
export type Session = {
  id: string;
  title: string;
  provider: string;
  collectionId: string;
  mode: "follow" | "once";
  state: SessionState;
  lastSeen: string | null;
  createdAt: string;
  externalId: string | null;
  itemCount?: number;
};
export type Item = {
  id: string;
  sessionId: string | null;
  collectionId: string;
  kind: ItemKind;
  title: string;
  body: string;
  url: string | null;
  imageUrl: string | null;
  groupName?: string;
  fileKey?: string | null;
  previewStatus?: "pending" | "ready" | "unavailable";
  mimeType?: string | null;
  embedUrl?: string | null;
  sourceText: string;
  sourceRole: string;
  sourceTurn: string;
  inferred: boolean;
  createdAt: string;
  updatedAt: string;
  art?: string;
};
export type Device = {
  id: string;
  name: string;
  lastSeen: string | null;
  createdAt: string;
  revoked: boolean;
};
export type WorkspaceData = {
  collections: Collection[];
  sessions: Session[];
  items: Item[];
  devices: Device[];
  user: { displayName: string; email: string } | null;
};
