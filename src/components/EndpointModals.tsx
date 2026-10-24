import { createEndpoint, importCurl, importOpenApi, type Result } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { footer } from "@/components/EditModals";
import { PlusIcon, UploadIcon } from "@/components/Icons";
import { KVRows } from "@/components/KVRows";
import { Modal } from "@/components/Modal";
import { METHODS } from "@/lib/methods";

type Action = (prev: Result, fd: FormData) => Promise<Result>;

// Import + From cURL + New endpoint, labelled: adding an endpoint is the page's primary action. /dev passes mock actions.
export function EndpointModals({
  serviceId,
  create = createEndpoint,
  importSpec = importOpenApi,
  fromCurl = importCurl,
}: {
  serviceId: string;
  create?: Action;
  importSpec?: Action;
  fromCurl?: Action;
}) {
  return (
    <>
      <Modal title="Endpoint from cURL" trigger={<><PlusIcon /> cURL</>}>
        <ActionForm action={fromCurl} reset className="flex flex-col gap-4">
          <input type="hidden" name="serviceId" value={serviceId} />
          <label className="label">
            cURL command
            <textarea name="curl" required rows={8} placeholder={"curl -X POST 'http://localhost:5001/api/auth/login' \\\n  -H 'Content-Type: application/json' \\\n  -d '{ \"username\": \"johndoe\" }'"} className="input w-full font-mono" />
            <span className="text-xs text-muted">Host is ignored; the service base path is stripped from the URL.</span>
          </label>
          <label className="label">
            Name (optional)
            <input name="name" placeholder="Defaults to METHOD /path" className="input w-full" />
          </label>
          <div className={`${footer} justify-end`}>
            <button className="btn-primary">Create endpoint</button>
          </div>
        </ActionForm>
      </Modal>
      <Modal title="Import OpenAPI" trigger={<><UploadIcon /> Import</>}>
        <ActionForm action={importSpec} reset className="flex flex-col gap-4">
          <input type="hidden" name="serviceId" value={serviceId} />
          {/* The whole zone is the picker; the input is visually hidden but stays focusable and `required`. :valid = a file is chosen. */}
          <label className="group flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2/50 p-6 text-center transition-colors hover:border-accent has-[:focus-visible]:border-accent has-[:valid]:border-solid has-[:valid]:border-accent has-[:valid]:bg-accent-soft">
            <span className="text-muted group-has-[:valid]:text-accent-text">
              <UploadIcon size={24} />
            </span>
            <span className="text-sm font-medium group-has-[:valid]:hidden">Choose an OpenAPI spec</span>
            <span className="hidden text-sm font-medium text-accent-text group-has-[:valid]:inline">File selected, click to change</span>
            <span className="text-xs text-muted">.yaml, .yml or .json. Endpoints already in this service are skipped.</span>
            <input name="file" type="file" accept=".yml,.yaml,.json" required className="sr-only" />
          </label>
          <div className={`${footer} justify-end`}>
            <button className="btn-primary">Import</button>
          </div>
        </ActionForm>
      </Modal>
      <Modal title="New endpoint" triggerClass="btn-primary" trigger={<><PlusIcon /> Endpoint</>}>
        <ActionForm action={create} reset className="flex flex-col gap-4">
          <input type="hidden" name="serviceId" value={serviceId} />
          <div className="grid grid-cols-4 gap-3">
            <label className="label">
              Method
              <select name="method" className="input w-full">
                {METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="label col-span-3">
              Path
              <input name="path" placeholder="/invoices/{id}" required className="input w-full font-mono" />
            </label>
            <label className="label col-span-4">
              Name
              <input name="name" placeholder="Get invoice" className="input w-full" />
            </label>
          </div>
          <div className="label">
            Query params
            <KVRows name="query" />
          </div>
          <div className="label">
            Headers
            <KVRows name="headers" />
          </div>
          <label className="label">
            Body (optional)
            <textarea name="body" placeholder={'{ "key": "value" }'} rows={4} className="input w-full font-mono" />
          </label>
          <div className={`${footer} justify-end`}>
            <button className="btn-primary">Create endpoint</button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

// Shown in place of the endpoint list while a service has none.
export function NoEndpoints({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong p-10 text-center">
      <p className="font-medium">No endpoints yet</p>
      <p className="max-w-sm text-sm text-muted">Import an OpenAPI spec to pull them all in at once, or add one by hand.</p>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
