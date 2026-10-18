# Newron rename

Production: https://newron.app. `www.newron.app` redirects to the apex.
Repository: https://github.com/FelixYifeiWang/newron.
Vercel project: `newron`, production branch `main`.

The repository and Vercel project were renamed in place. Database, Blob storage, environment secrets, accounts, collection IDs, and device tokens remain unchanged. The original GitHub URL redirects to the renamed repository. Vercel's Git integration uses the new repository name and the same repository ID.

Google OAuth uses the Newron app/client names and `https://newron.app/api/auth/callback/google`. The original callback remains registered for compatibility. `BETTER_AUTH_URL` is the new production origin. Existing users sign in with the same Google account on the new domain; browser cookies cannot be transferred across domains.

The website is Newron. Native display names, the app icon, menu-bar icon, and Applications shortcut use Nox. The internal launcher bundle remains `Commonplace.app`; setup migrates the owned `Newron.app` shortcut to `Nox.app` without replacing unrelated applications. Internal `commonplace://` links, the original Application Support folder, LaunchAgent IDs, encrypted-storage identity, and auth cookie prefixes intentionally remain stable. New-domain setup reuses the original installation identity. Both domain-specific opener links are accepted by updated launchers; the website emits the legacy-compatible link so already-installed buddies can open without another setup. The old hosted origin remains available for existing devices.

The installer runtime's internal package name stays unchanged to preserve the macOS encryption service. Do not globally replace internal identifiers during future branding updates.

Validation: 247 tests passed in Vercel, plus lint and TypeScript compilation. Domain configuration and HTTPS verified. Live Google sign-in on newron.app restores the existing four collections. The installed app reports Newron and retains all six existing subscriptions.
