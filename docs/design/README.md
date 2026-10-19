# Design references

[Read the product development session](product-session.md): the founder’s requests, design feedback, and Codex responses from October 17–18, 2026. Use it as context for videos, mockups, and prototypes.

This is a sanitized historical transcript, not the raw Codex log or a current specification. Later feedback takes precedence. Credentials, private setup links, local files, screenshots, and tool output are excluded. Check [newron.app](https://newron.app) and the current code when depicting a working feature.

## Labs

Open these files in Chrome. They are the design labs for Nox and Newron's mark.

- [newron-marks.html](labs/newron-marks.html): logo directions and Nox's idle and working motion. Melt is in use: its resting N is Newron's logo (`lib/newron-mark.mjs`), and Nox draws it live (`lib/nox-mark.ts`). Rewire, Relay and Mesh are kept for later. Each rests on the same N, and `createMark(canvas, size, motion)` can switch to one.
- [nox-glass-lab.html](labs/nox-glass-lab.html): circular glass for Nox. The Nox lens is measured from the reference photo and compared with React Bits, Glacé and Crenspire.
