// Blob pathnames are literal storage keys. get() interpolates them into a URL,
// so percent signs in already-encoded owner IDs/filenames must survive URL decoding.
export function blobRequestPath(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}
