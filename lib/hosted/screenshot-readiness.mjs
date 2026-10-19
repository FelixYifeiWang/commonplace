// Runs in an isolated page. Keep this function self-contained for Chromium.
export function pageReadiness() {
  const visible = (el) => {
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el);
    return (
      r.width > 24 &&
      r.height > 24 &&
      r.top < innerHeight &&
      r.bottom > 0 &&
      s.visibility !== "hidden" &&
      Number(s.opacity) !== 0
    );
  };
  const images = [...document.images].filter(visible);
  const loaded = images.filter((i) => i.complete && i.naturalWidth > 0);
  const text = (document.body?.innerText || "").trim();
  const blocked =
    /just a moment|access denied|sign in|log in|checking your browser|verify you are human/i.test(
      document.title,
    ) ||
    (/sign in|log in/i.test(text) && text.length < 450);
  return {
    blocked,
    ready:
      !blocked &&
      document.readyState !== "loading" &&
      document.fonts.status === "loaded" &&
      !images.some((i) => !i.complete) &&
      ![
        ...document.querySelectorAll('[aria-busy="true"],[role="progressbar"]'),
      ].some(visible) &&
      (text.length > 120 || loaded.some((i) => i.width * i.height > 5000)),
    signature: [
      text.length,
      document.body?.scrollHeight,
      loaded.map((i) => i.naturalWidth + "x" + i.naturalHeight).join(","),
    ].join(":"),
  };
}
