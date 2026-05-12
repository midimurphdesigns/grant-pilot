"use client";

import { memo, useEffect, useState } from "react";

const ROTATING_PROMPTS = [
  '"Find SBIR grants for an Arizona robotics startup with 4 employees."',
  '"Federal grants for a 501(c)(3) workforce-development nonprofit in Detroit."',
  '"Solar-energy R&D grants for a 12-person engineering firm."',
];

const CARET = "▍";
const TYPE_MS = 38;
const HOLD_MS = 1800;
const ERASE_MS = 22;

function TypewriterBase() {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"type" | "hold" | "erase">("type");

  useEffect(() => {
    const target = ROTATING_PROMPTS[idx];
    if (phase === "type") {
      if (text.length < target.length) {
        const t = setTimeout(() => setText(target.slice(0, text.length + 1)), TYPE_MS);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase("hold"), HOLD_MS);
      return () => clearTimeout(t);
    }
    if (phase === "hold") {
      const t = setTimeout(() => setPhase("erase"), HOLD_MS);
      return () => clearTimeout(t);
    }
    if (text.length > 0) {
      const t = setTimeout(() => setText(text.slice(0, -1)), ERASE_MS);
      return () => clearTimeout(t);
    }
    setIdx((idx + 1) % ROTATING_PROMPTS.length);
    setPhase("type");
  }, [text, phase, idx]);

  return (
    <span aria-hidden className="text-[var(--color-foreground)]">
      {text}
      <span className="text-[var(--color-primary)] animate-pulse">{CARET}</span>
    </span>
  );
}

const Typewriter = memo(TypewriterBase);

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="border-l-2 border-[var(--color-primary)]/30 pl-5 py-6 space-y-3">
      <p className="type-eyebrow text-[var(--color-muted-foreground)]">Try a prompt like</p>
      <p className="text-sm leading-6 font-mono">
        <Typewriter />
      </p>
      <p className="mt-4 text-xs leading-5 text-[var(--color-muted-foreground)] max-w-md">
        {message}
      </p>
    </div>
  );
}
