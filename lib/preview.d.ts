declare module "virtual:commonplace-preview" {
  const bridge: {
    preview(
      url: string,
    ): Promise<{
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
