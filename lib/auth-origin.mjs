// OAuth must start and finish on the same origin so its state cookie survives.
export function signInOriginRedirect(origin, authOrigin) {
  const canonical = new URL(authOrigin).origin;
  return new URL(origin).origin === canonical ? null : `${canonical}/sign-in`;
}
