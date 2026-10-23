import type { Service } from "@/lib/db";

// Four columns: name full width, type + protocol halves, host wide + port narrow, base path full width.
export function ServiceFields({ s }: { s?: Pick<Service, "name" | "protocol" | "host" | "port" | "basePath"> }) {
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
    </div>
  );
}
