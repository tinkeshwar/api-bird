"use client";

import { useId, useState } from "react";
import type { Auth, Service } from "@/lib/db";

export type ServiceInit = Pick<Service, "name" | "protocol" | "host" | "port" | "basePath" | "auth">;

// Four columns: name full width, type + protocol halves, host wide + port narrow, base path full width, then auth.
// vars = project variable names, offered as {{name}} suggestions on every auth value; warn = var → warning shown with it.
export function ServiceFields({ s, vars = [], warn = {} }: { s?: ServiceInit; vars?: string[]; warn?: Record<string, string> }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <label className="label col-span-4">
        Name
        <input name="name" placeholder="Service name" defaultValue={s?.name} className="input w-full" />
      </label>
      <label className="label col-span-2">
        Type
        <select name="type" defaultValue="rest" className="input w-full">
          <option value="rest">REST API</option>
        </select>
      </label>
      <label className="label col-span-2">
        Protocol
        <select name="protocol" defaultValue={s?.protocol ?? "http"} className="input w-full">
          <option value="http">http</option>
          <option value="https">https</option>
        </select>
      </label>
      <label className="label col-span-3">
        Host
        <input name="host" placeholder="localhost" defaultValue={s?.host} className="input w-full" />
      </label>
      <label className="label">
        Port
        <input name="port" type="number" min={1} max={65535} placeholder="8080" defaultValue={s?.port} className="input w-full" />
      </label>
      <label className="label col-span-4">
        Base path (optional)
        <input name="basePath" placeholder="/api/v1" defaultValue={s?.basePath} className="input w-full font-mono" />
      </label>
      <AuthFields auth={s?.auth} vars={vars} warn={warn} />
    </div>
  );
}

// Posts auth.type plus that type's fields; readAuth in app/actions.ts reads them.
function AuthFields({ auth, vars, warn }: { auth?: Auth; vars: string[]; warn: Record<string, string> }) {
  const [type, setType] = useState<Auth["type"]>(auth?.type ?? "none");
  const list = useId();
  const a = (auth ?? {}) as Partial<Record<string, string>>;
  // Native datalist: a suggestion picker of {{vars}} that still allows free text.
  const field = (k: string, label: string, span: string, placeholder = "{{var}} or value", secret = false) => (
    <label key={k} className={`label ${span}`}>
      {label}
      <input
        name={`auth.${k}`}
        defaultValue={a[k]}
        placeholder={placeholder}
        list={vars.length ? list : undefined}
        type={secret ? "password" : "text"}
        autoComplete="off"
        className="input w-full font-mono"
      />
    </label>
  );

  return (
    <fieldset className="col-span-4 grid grid-cols-4 gap-3 border-t border-line pt-3">
      <label className="label col-span-4">
        Auth
        <select name="auth.type" value={type} onChange={(e) => setType(e.target.value as Auth["type"])} className="input w-full">
          <option value="none">None</option>
          <option value="bearer">Bearer token</option>
          <option value="basic">Basic</option>
          <option value="apikey">API key</option>
        </select>
      </label>
      {type === "bearer" && field("token", "Token", "col-span-4", "{{accessToken}}")}
      {type === "basic" && [field("username", "Username", "col-span-2"), field("password", "Password", "col-span-2", undefined, true)]}
      {type === "apikey" && (
        <>
          <label className="label">
            In
            <select name="auth.in" defaultValue={auth?.type === "apikey" ? auth.in : "header"} className="input w-full">
              <option value="header">Header</option>
              <option value="query">Query</option>
            </select>
          </label>
          {field("name", "Name", "col-span-3", "X-API-Key")}
          {field("value", "Value", "col-span-4")}
        </>
      )}
      {type !== "none" && (
        <p className="col-span-4 text-xs text-muted">Applied to every endpoint except those marked No auth. Endpoint headers with the same name win.</p>
      )}
      <datalist id={list}>
        {vars.map((v) => (
          <option key={v} value={`{{${v}}}`} label={warn[v] && `⚠ ${warn[v]}`} />
        ))}
      </datalist>
    </fieldset>
  );
}
