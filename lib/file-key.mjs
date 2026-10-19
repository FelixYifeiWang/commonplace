// Storage keys are opaque filenames inside one owner's upload namespace.
export function ownedFileKey(key, ownerId) {
  if (
    typeof key !== "string" ||
    !key.startsWith(`users/${encodeURIComponent(ownerId)}/`)
  )
    return false;
  try {
    return key
      .split("/")
      .slice(2)
      .every((part) => {
        const name = decodeURIComponent(part);
        return (
          !!name &&
          name !== "." &&
          name !== ".." &&
          !/[\\/\x00-\x1f]/.test(name)
        );
      });
  } catch {
    return false;
  }
}
