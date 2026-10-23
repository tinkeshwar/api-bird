"use client";

import { useState } from "react";
import { deleteVar, setProjectHeaders, setVar, type Result } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Tabs } from "@/components/EndpointWorkbench";
import { EyeIcon, TrashIcon } from "@/components/Icons";
import { KVRows } from "@/components/KVRows";
import type { KV, Var } from "@/lib/db";

type Action = (prev: Result, fd: FormData) => Promise<Result>;

// One variable: name (fixed once saved), value masked while secret, secret + reveal toggles.
function VarRow({ projectId, name, v, save, remove }: { projectId: string; name?: string; v?: Var; save: Action; remove: Action }) {
  const [secret, setSecret] = useState(!!v?.secret);
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionForm action={save} reset={!name} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <input
          name="name"
          defaultValue={name}
          readOnly={!!name}
          required
          placeholder="name"
          aria-label="Variable name"
          className={`input w-40 font-mono ${name ? "text-accent-text" : ""}`}
        />
        <input
          name="value"
          type={secret && !shown ? "password" : "text"}
          defaultValue={v?.value}
          placeholder="value"
          aria-label={`Value of ${name ?? "new variable"}`}
          autoComplete="off"
          className="input min-w-40 flex-1 font-mono"
        />
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" name="secret" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
          Secret
        </label>
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          disabled={!secret}
          aria-pressed={shown}
          aria-label={shown ? "Hide value" : "Reveal value"}
          title={shown ? "Hide value" : "Reveal value"}
          className={`btn-icon ${shown ? "text-accent-text" : ""}`}
        >
          <EyeIcon />
        </button>
        <button className="btn">{name ? "Save" : "Add"}</button>
      </ActionForm>
      {name && (
        <ActionForm action={remove} confirm={`Delete {{${name}}}?`}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="name" value={name} />
          <button className="btn-icon hover:text-[var(--c-red)]" aria-label={`Delete ${name}`} title="Delete variable">
            <TrashIcon />
          </button>
        </ActionForm>
      )}
    </div>
  );
}

// Project variables, referenced as {{name}} in endpoint paths, query, headers and body,
// and project headers, sent with every request (an endpoint's own header of the same name wins).
export function VarsPanel({
  projectId,
  vars,
  headers = [],
  save = setVar,
  remove = deleteVar,
  saveHeaders = setProjectHeaders,
}: {
  projectId: string;
  vars: Record<string, Var>;
  headers?: KV[];
  save?: Action;
  remove?: Action;
  saveHeaders?: Action;
}) {
  const [tab, setTab] = useState<"Variables" | "Headers">("Variables");
  const names = Object.keys(vars).sort();
  return (
    <section className="card gap-3 p-4" aria-label="Project settings">
      <Tabs tabs={[["Variables", names.length], ["Headers", headers.length]]} active={tab} onPick={setTab} />
      {tab === "Variables" ? (
        <>
          <p className="text-sm text-muted">
            Use as <code className="font-mono text-accent-text">{"{{name}}"}</code> in any endpoint&apos;s path, query, headers or body.
          </p>
          <div className="space-y-2">
            {names.map((n) => (
              <VarRow key={n} projectId={projectId} name={n} v={vars[n]} save={save} remove={remove} />
            ))}
            {/* Keyed by count so the add row's toggles reset after each add. A space can't appear in a var name. */}
            <VarRow key={` new ${names.length}`} projectId={projectId} save={save} remove={remove} />
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Sent with every request in this project. An endpoint&apos;s own header of the same name wins. Values accept{" "}
            <code className="font-mono text-accent-text">{"{{vars}}"}</code>.
          </p>
          <ActionForm action={saveHeaders} className="space-y-2">
            <input type="hidden" name="projectId" value={projectId} />
            <KVRows name="headers" initial={headers} />
            <div className="flex justify-end">
              <button className="btn">Save headers</button>
            </div>
          </ActionForm>
        </>
      )}
    </section>
  );
}
