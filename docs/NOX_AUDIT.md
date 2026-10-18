# Nox identity audit

Newron is the website and product. Nox is its macOS companion.

## Fixed

- Native app/menu/About/window labels and the menu-bar tooltip now say Nox.
- App and menu-bar icons use the neuron design. The former face icon is removed.
- Setup creates `~/Applications/Nox.app`. It removes an old `Newron.app` shortcut only when both shortcuts point to this installation. Unrelated apps are preserved.
- Native assets resolve in both the downloaded release and the source checkout.
- Buddy pages have the Nox page title and are excluded from search indexing.
- Newron has explicit social-preview metadata, a share image and an N favicon.
- Setup instructions point to Settings → Connections and explain how to reopen Nox.
- Existing default “Desktop buddy” device labels display as Nox. Personal computer names remain unchanged.

## Compatibility

The `commonplace://` scheme, opener bundle identifier/path, LaunchAgent label, Application Support directory, Electron package names, encryption service and icon filenames remain stable. Renaming these indiscriminately can break launch links or saved credentials. The website, GitHub repository, Vercel project and Google OAuth client remain Newron.

The preview uses the official, unmodified Electron runtime. Low-level process listings can still say Electron. A fully branded, signed and notarized standalone distribution remains separate work.

## Verification

Installer tests cover fresh setup, repeat setup, native identity, safe alias migration and preservation of other apps. Existing tests cover dragging, hit testing, collection capture and transcript following. Hosted metadata and packaged release checks are run against newron.app. Browser automation does not permit custom-protocol handoffs, so the browser-to-app launch remains a manual check.
