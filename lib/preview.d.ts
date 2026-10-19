declare module "virtual:commonplace-preview" {
  const bridge: {
    screenshot(url: string): Promise<Response>;
    image?(url: string): Promise<{ body: Uint8Array; contentType: string }>;
    ticket(ownerId: string): Promise<{ url: string }>;
    fileInfo(key: string): Promise<{
      key: string;
      name: string;
      mimeType: string;
      ownerId: string;
      size: number;
    }>;
    file(key: string, range?: string): Promise<Response>;
    preview(url: string): Promise<{
      title?: string;
      body?: string;
      imageUrl?: string | null;
      embedUrl?: string | null;
      mimeType?: string;
      kind?: string;
      previewStatus: string;
    }>;
  };
  export default bridge;
}
