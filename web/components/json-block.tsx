import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tiny zero-dependency JSON pretty-printer with token-level color
 * coding. Faster than Shiki/Prism for our short payloads, no extra
 * bundle weight. Strings, numbers, booleans, nulls, keys each get a
 * distinct color from the existing palette.
 */
export function JsonBlock({
  value,
  className,
  maxHeight,
}: {
  value: unknown;
  className?: string;
  maxHeight?: string;
}) {
  const pretty = React.useMemo(() => JSON.stringify(value, null, 2), [value]);

  const tokens = React.useMemo(() => tokenize(pretty), [pretty]);

  return (
    <pre
      className={cn(
        "text-[11px] leading-5 overflow-x-auto bg-white/[0.02] border border-[var(--color-border)] p-3",
        className,
      )}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
    >
      {tokens.map((t, i) => (
        <span key={i} className={tokenClass(t.type)}>
          {t.value}
        </span>
      ))}
    </pre>
  );
}

type Token = { type: TokenType; value: string };
type TokenType =
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "punctuation"
  | "whitespace";

function tokenClass(type: TokenType): string {
  switch (type) {
    case "key":
      return "text-[var(--color-primary)]";
    case "string":
      return "text-emerald-300/90";
    case "number":
      return "text-yellow-300/90";
    case "boolean":
      return "text-purple-300";
    case "null":
      return "text-red-300/90";
    case "punctuation":
      return "text-[var(--color-muted-foreground)]";
    case "whitespace":
      return "";
  }
}

function tokenize(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") {
      let j = i;
      while (j < input.length && /[\s]/.test(input[j]!)) j++;
      out.push({ type: "whitespace", value: input.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '"') {
      // string — peek ahead to detect if this is a key (followed by ':')
      let j = i + 1;
      while (j < input.length) {
        if (input[j] === "\\") {
          j += 2;
          continue;
        }
        if (input[j] === '"') break;
        j++;
      }
      const literal = input.slice(i, j + 1);
      // Skip whitespace to find a colon — if so, key.
      let k = j + 1;
      while (k < input.length && /[\s]/.test(input[k]!)) k++;
      const isKey = input[k] === ":";
      out.push({ type: isKey ? "key" : "string", value: literal });
      i = j + 1;
      continue;
    }
    if (/[\d-]/.test(ch)) {
      let j = i;
      while (j < input.length && /[\d.eE+\-]/.test(input[j]!)) j++;
      out.push({ type: "number", value: input.slice(i, j) });
      i = j;
      continue;
    }
    // Match true/false/null tokens
    if (input.startsWith("true", i)) {
      out.push({ type: "boolean", value: "true" });
      i += 4;
      continue;
    }
    if (input.startsWith("false", i)) {
      out.push({ type: "boolean", value: "false" });
      i += 5;
      continue;
    }
    if (input.startsWith("null", i)) {
      out.push({ type: "null", value: "null" });
      i += 4;
      continue;
    }
    out.push({ type: "punctuation", value: ch });
    i += 1;
  }
  return out;
}
