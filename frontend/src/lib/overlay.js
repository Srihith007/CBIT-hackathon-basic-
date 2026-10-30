/** Map a box in video pixels to canvas pixels for a <video> using object-fit: contain. */
export function containTransform(videoW, videoH, boxW, boxH) {
  const scale = Math.min(boxW / videoW, boxH / videoH);
  return { scale, ox: (boxW - videoW * scale) / 2, oy: (boxH - videoH * scale) / 2 };
}

export function mapBox(bbox, tf) {
  const [x1, y1, x2, y2] = bbox;
  return { x: tf.ox + x1 * tf.scale, y: tf.oy + y1 * tf.scale, w: (x2 - x1) * tf.scale, h: (y2 - y1) * tf.scale };
}

/** Overlay items are sampled frames with `time_ms` in media ms. Return the latest sample at or before `mediaMs`, only if it is
 *  recent enough; between samples nothing was observed, so nothing is drawn (never interpolated). */
export function latestSample(items, mediaMs, maxAgeMs = 350) {
  let best = null;
  for (const it of items) if (it.time_ms <= mediaMs + 20 && (!best || it.time_ms > best.time_ms)) best = it;
  return best && mediaMs - best.time_ms < maxAgeMs ? best : null;
}
