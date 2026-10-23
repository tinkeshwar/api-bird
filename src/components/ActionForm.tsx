"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { Result } from "@/app/actions";

// Wraps a server action with a visible error/message line.
// Submits via onSubmit instead of action={} so React doesn't reset inputs when validation fails.
// With `reset`, fields remount after each success (clears stateful children like KVRows too).
// Inside a <dialog> (Modal), success closes the dialog unless it carries a message to show.
// With `confirm`, the first submit swaps the form's contents for an inline prompt; its Delete button submits for real.
export function ActionForm({
  action,
  children,
  className,
  reset,
  confirm,
  id,
}: {
  action: (prev: Result, fd: FormData) => Promise<Result>;
  children: React.ReactNode;
  className?: string;
  reset?: boolean;
  confirm?: string;
  id?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [asking, setAsking] = useState(false);
  const [state, run, pending] = useActionState(async (prev: Result & { n?: number }, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok) setAsking(false);
    if (r.ok && !r.message) form.current?.closest("dialog")?.close();
    return { ...r, n: (prev.n ?? 0) + (r.ok ? 1 : 0) };
  }, { n: 0 });

  // Closing the surrounding modal drops a pending confirmation.
  useEffect(() => {
    const d = form.current?.closest("dialog");
    const cancel = () => setAsking(false);
    d?.addEventListener("close", cancel);
    return () => d?.removeEventListener("close", cancel);
  }, []);

  return (
    <form
      ref={form}
      id={id}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !asking) return setAsking(true);
        const fd = new FormData(e.currentTarget);
        startTransition(() => run(fd));
      }}
    >
      {/* Hidden, not unmounted: hidden inputs like the id still submit. */}
      <fieldset key={reset ? state.n : undefined} disabled={pending} hidden={asking} className="contents">
        {children}
      </fieldset>
      {asking && (
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-fg">{confirm}</p>
          <div className="flex gap-2">
            {/* autoFocus: focus lands on the safe choice when the prompt appears */}
            <button type="button" autoFocus className="btn" onClick={() => setAsking(false)}>
              Cancel
            </button>
            <button disabled={pending} className="btn-danger">
              Delete
            </button>
          </div>
        </div>
      )}
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="w-full text-sm text-green-700">{state.message}</p>}
    </form>
  );
}
