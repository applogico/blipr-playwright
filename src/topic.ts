/** Server rule for a topic name (and a protected topic's leaf): 1-64 of `[A-Za-z0-9_-]`. */
const LEAF_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Server rule for a handle: 3-30 of `[a-z0-9_]`, no leading digit (matched case-insensitively). */
const HANDLE_RE = /^[a-z_][a-z0-9_]{2,29}$/;

/** The URL path segment(s) for a topic, or undefined when the server would reject it. */
export function topicPath(topic: string): string | undefined {
  const protectedTopic = /^(?:@|%40)([^/]+)\/([^/]+)$/i.exec(topic);
  if (protectedTopic) {
    const handle = protectedTopic[1].toLowerCase();
    const leaf = protectedTopic[2];
    return HANDLE_RE.test(handle) && LEAF_RE.test(leaf) ? `@${handle}/${leaf}` : undefined;
  }
  return LEAF_RE.test(topic) ? topic : undefined;
}
