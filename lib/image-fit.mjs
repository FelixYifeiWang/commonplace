// How an image sits on a Story canvas or Gallery tile (see STORY_CANVAS.md, "Fitting images").
// Works on plain RGBA pixels ({ data, width, height }), so it runs in Node (the capture worker) and in the browser.
//
//   page   – the edge is busy (a screenshot, a photo): crop from the top, keep its own ground.
//   object – a solid shape on a plain ground (a product shot, a component): cut out, trimmed, shown whole.
//   ink    – sparse dark marks on a light ground (a sketch, a wireframe, a type specimen): blend into the sheet.

const distance = (d, i, c) =>
  Math.max(
    Math.abs(d[i] - c[0]),
    Math.abs(d[i + 1] - c[1]),
    Math.abs(d[i + 2] - c[2]),
  );

function edgeStats({ data, width, height }) {
  const sum = [0, 0, 0];
  const samples = [];
  const take = (x, y) => {
    const i = (y * width + x) * 4;
    samples.push(i);
    sum[0] += data[i];
    sum[1] += data[i + 1];
    sum[2] += data[i + 2];
  };
  for (let x = 0; x < width; x++) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    take(0, y);
    take(width - 1, y);
  }
  const mean = sum.map((v) => Math.round(v / samples.length));
  const spread =
    samples.reduce((t, i) => t + distance(data, i, mean), 0) / samples.length;
  return { mean, spread };
}

function foreground({ data, width, height }, mat, tolerance) {
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1,
    count = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (distance(data, (y * width + x) * 4, mat) <= tolerance) continue;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return count
    ? { count, box: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } }
    : { count, box: null };
}

/** @param {{data: Uint8ClampedArray|Uint8Array, width: number, height: number}} image */
export function classifyImage(
  image,
  { tolerance = 24, busyEdge = 18, sparse = 0.35, source = "" } = {},
) {
  // A website capture is a page by definition, even when it is mostly white with sparse content.
  if (source === "website") {
    const { mean } = edgeStats(image);
    return {
      kind: "page",
      matColor: mean,
      trim: null,
      aspect: image.width / image.height,
    };
  }
  const { mean, spread } = edgeStats(image);
  const aspect = image.width / image.height;
  if (spread > busyEdge)
    return { kind: "page", matColor: mean, trim: null, aspect };
  const fg = foreground(image, mean, tolerance);
  if (!fg.box) return { kind: "page", matColor: mean, trim: null, aspect };
  const density = fg.count / (fg.box.width * fg.box.height);
  const light = (mean[0] + mean[1] + mean[2]) / 3 > 200;
  const kind = light && density < sparse ? "ink" : "object";
  return {
    kind,
    matColor: mean,
    trim: fg.box,
    aspect: fg.box.width / fg.box.height,
  };
}

// Removes the plain ground connected to the edges (so enclosed areas of the same colour survive),
// softens the cut by one pixel, and trims to what is left.
export function cutOut(image, { tolerance = 22, trim = true } = {}) {
  const { width, height } = image;
  const data = new Uint8ClampedArray(image.data);
  const { mean } = edgeStats(image);
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const k = stack.pop();
    if (seen[k] || distance(data, k * 4, mean) > tolerance) continue;
    seen[k] = 1;
    data[k * 4 + 3] = 0;
    const x = k % width,
      y = (k - x) / width;
    if (x > 0) stack.push(k - 1);
    if (x < width - 1) stack.push(k + 1);
    if (y > 0) stack.push(k - width);
    if (y < height - 1) stack.push(k + width);
  }
  for (let k = 0; k < width * height; k++) {
    if (seen[k]) continue;
    const x = k % width,
      y = (k - x) / width;
    const edge =
      (x > 0 && seen[k - 1]) ||
      (x < width - 1 && seen[k + 1]) ||
      (y > 0 && seen[k - width]) ||
      (y < height - 1 && seen[k + width]);
    if (edge && distance(data, k * 4, mean) < tolerance * 2)
      data[k * 4 + 3] = 160;
  }
  if (!trim) return { data, width, height, box: { x: 0, y: 0, width, height } };
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 20) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0)
    return { data: new Uint8ClampedArray(0), width: 0, height: 0, box: null };
  const w = x1 - x0 + 1,
    h = y1 - y0 + 1,
    out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    out.set(
      data.subarray(
        ((y0 + y) * width + x0) * 4,
        ((y0 + y) * width + x0 + w) * 4,
      ),
      y * w * 4,
    );
  return {
    data: out,
    width: w,
    height: h,
    box: { x: x0, y: y0, width: w, height: h },
  };
}
