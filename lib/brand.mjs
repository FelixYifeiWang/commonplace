export const PRODUCT_NAME = "Newron";
export const PRODUCTION_ORIGIN = "https://newron.app";
export const LEGACY_ORIGIN = "https://commonplace-pearl.vercel.app";

// Existing launchers recognize this exact origin. Keep the protocol stable
// while the website moves; this opens the same installed Nox without setup.
export function buddyLink(origin) {
  const identity = origin === PRODUCTION_ORIGIN ? LEGACY_ORIGIN : origin;
  return `commonplace://show?origin=${encodeURIComponent(identity)}`;
}
