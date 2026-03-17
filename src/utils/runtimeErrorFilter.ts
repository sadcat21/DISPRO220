const IGNORED_RUNTIME_PATTERNS = [
  "uistyleerror",
  "ui_error",
  "طلب تعديل من المستخدم",
  "طلب المستخدم",
  "[respond and provide all suggestions in arabic]",
  "respond and provide all suggestions in arabic",
];

const appendText = (bucket: string[], value: unknown) => {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed) bucket.push(trimmed);
};

const collectRuntimeTexts = (
  value: unknown,
  bucket: string[],
  seen: WeakSet<object>,
  depth = 0
) => {
  if (value == null || depth > 4) return;

  if (typeof value === "string") {
    appendText(bucket, value);
    return;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    appendText(bucket, String(value));
    return;
  }

  if (value instanceof Error) {
    appendText(bucket, value.name);
    appendText(bucket, value.message);
    appendText(bucket, value.stack);

    const maybeCause = (value as Error & { cause?: unknown }).cause;
    if (maybeCause) {
      collectRuntimeTexts(maybeCause, bucket, seen, depth + 1);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 12)) {
      collectRuntimeTexts(item, bucket, seen, depth + 1);
    }
    return;
  }

  if (typeof value === "object") {
    if (seen.has(value)) return;
    seen.add(value);

    const candidate = value as Record<string, unknown>;
    const commonKeys = ["name", "message", "stack", "reason", "error_type", "solution", "details"];

    for (const key of commonKeys) {
      if (key in candidate) {
        collectRuntimeTexts(candidate[key], bucket, seen, depth + 1);
      }
    }

    for (const [key, nestedValue] of Object.entries(candidate).slice(0, 16)) {
      appendText(bucket, key);
      collectRuntimeTexts(nestedValue, bucket, seen, depth + 1);
    }

    try {
      appendText(bucket, JSON.stringify(value));
    } catch {
      appendText(bucket, String(value));
    }
  }
};

export const describeRuntimeIssue = (value: unknown): string => {
  const bucket: string[] = [];
  collectRuntimeTexts(value, bucket, new WeakSet<object>());
  return bucket.join(" ") || String(value ?? "");
};

export const shouldIgnoreRuntimeIssue = (value: unknown): boolean => {
  const text = describeRuntimeIssue(value).toLowerCase();
  return IGNORED_RUNTIME_PATTERNS.some((pattern) => text.includes(pattern));
};
