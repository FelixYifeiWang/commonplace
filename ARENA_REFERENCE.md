# Block rendering reference

Reviewed Are.na's public API models and block documentation on 17 October 2026:

- https://www.are.na/developers/explore/block/block
- https://www.are.na/developers/explore/block/post-block
- https://dev.are.na/documentation/blocks
- https://github.com/aredotna/arena-php

Are.na distinguishes Text, Image, Link, Embed, and Attachment blocks. Images have separate source and display sizes; links can carry screenshot previews; embeds preserve playable media; attachments can have file previews. Processing status is separate from content, and a block retains its original source.

Commonplace applies the same content-first distinction with square, restrained cards. Website metadata supplies a title, description and cover; direct images preserve their proportions; supported video embeds play in details; direct audio has controls; PDFs use a document viewer; other files retain their source link. Text stays readable as text. Captions appear on hover or keyboard focus.

This local implementation uses Open Graph/Twitter covers, not rendered website screenshots. When a site blocks requests or has no usable cover, the card keeps its title and source. PDF first-page thumbnails and durable thumbnail storage are not implemented. No arbitrary embed HTML is executed.

Preview extraction is a local development service behind an authenticated route and a private server bridge. Requests have size/time limits, validate redirects and pin DNS to public IPv4 addresses. It never forwards session cookies or account credentials to source websites. Hosted preview extraction is intentionally unconfigured while this project is local-only.
