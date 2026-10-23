"use client";

import { useRef } from "react";
import { CloseIcon } from "@/components/Icons";

// Native <dialog>: showModal() gives focus trap, Esc to close and a backdrop for free.
// A successful ActionForm inside closes it (see ActionForm).
export function Modal({
  title,
  trigger,
  triggerClass = "btn",
  label,
  children,
}: {
  title: string;
  trigger: React.ReactNode;
  triggerClass?: string;
  label?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className={triggerClass} aria-label={label} title={label} onClick={() => ref.current?.showModal()}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => e.target === ref.current && ref.current.close()}
        className="m-auto w-full max-w-lg rounded-2xl border border-line bg-surface text-fg shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{title}</h2>
            <button type="button" className="btn-icon border-transparent" aria-label="Close" onClick={() => ref.current?.close()}>
              <CloseIcon />
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
