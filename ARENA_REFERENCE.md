# Block rendering reference

Reviewed Are.na's public API models and block documentation on 17 October 2026:

- https://www.are.na/developers/explore/block/block
- https://www.are.na/developers/explore/block/post-block
- https://dev.are.na/documentation/blocks
- https://github.com/aredotna/arena-php
- https://help.are.na/docs/getting-started/blocks
- https://help.are.na/docs/getting-started/blocks/adding-blocks
- https://help.are.na/docs/getting-started/connections

Are.na distinguishes Text, Image, Link, Embed, and Attachment blocks. Images have separate source and display sizes; links can carry screenshot previews; embeds preserve playable media; attachments can have file previews. Processing status is separate from content, and a block retains its original source.

Commonplace applies the same content-first distinction with square, restrained cards. Website metadata supplies a title, description and cover; direct images preserve their proportions; supported video embeds play in details; direct audio has controls; PDFs use a document viewer; other files retain their source link. Text stays readable as text. Compact titles and source names stay below the artwork.

Websites prefer a locally rendered viewport screenshot, with Open Graph/Twitter covers and then title/source as fallbacks. The filter menu can switch back to cover images. Screenshots are captured in a sandboxed offscreen Electron process with an ephemeral profile, no account cookies, no preload or application IPC, denied permissions and public-address-only HTTP transport. Captures are cached under `.sites-runtime/screenshots/`; the first capture takes several seconds, and slow or blocked pages fall back. PDF first-page thumbnails are not implemented. No arbitrary embed HTML is executed.

The default grid groups by hostname (ignoring `www.`). Different paths remain separate source blocks. Distinct subdomains remain separate to avoid merging hosted tenants. Hover fans the stack; clicking opens its pages. Search matches original titles, content, URLs and group names; type and source filters are independent. Explicit named groups can combine pages about a person or topic across sites. This is user-directed grouping, not automatic entity inference.

The add form accepts a URL, text, or dropped/pasted/chosen files without a type picker. Files are streamed to private local storage through a short-lived single-use ticket, with a 250 MB per-file limit. Authenticated file routes support byte ranges for media. These upload limits are independent of the uncapped streaming session transcript importer.

Preview extraction is a local development service behind an authenticated route and a private server bridge. Requests have size/time limits, validate redirects and pin DNS to public IPv4 addresses. It never forwards session cookies or account credentials to source websites. Hosted preview extraction is intentionally unconfigured while this project is local-only.
