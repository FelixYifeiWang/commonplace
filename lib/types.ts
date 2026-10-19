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
  resumeOnRestore?: boolean;
  frozenAt?: string | null;
  deletedAt?: string | null;
  favorite?: boolean;
  id: string;
  name: string;
  description: string;
  createdAt: string;
};
export type Session = {
  snapshotUnfinished?: boolean;
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
  sessionAttachment?: boolean;
  sharedCollectionId?: string;
  deletedAt?: string | null;
  collectionName?: string;
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
  previewVersion?: number;
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
  readyAt?: string | null;
  id: string;
  name: string;
  lastSeen: string | null;
  createdAt: string;
  revoked: boolean;
};
export type WorkspaceData = {
  recentlyDeleted?: Item[];
  deletedCollections?: Collection[];
  collections: Collection[];
  sessions: Session[];
  items: Item[];
  devices: Device[];
  user: { displayName: string; email: string } | null;
};
