import { notFound } from "next/navigation";
import { mockCapture, mockLock, mockRemove, mockRename, mockRun, mockSave, mockUncapture } from "@/app/(app)/dev/actions";
import { ActionForm } from "@/components/ActionForm";
import { AddCard } from "@/components/AddCard";
import { BackLink } from "@/components/BackLink";
import { ServiceCard } from "@/components/Cards";
import { PencilIcon, PlayIcon, PlugIcon, PlusIcon, ServerIcon, SlidersIcon, TrashIcon, UploadIcon } from "@/components/Icons";
import { footer } from "@/components/EditModals";
import { EndpointList } from "@/components/EndpointList";
import { EndpointModals, NoEndpoints } from "@/components/EndpointModals";
import { EndpointWorkbench } from "@/components/EndpointWorkbench";
import { Modal } from "@/components/Modal";
import { MethodMix, OverviewHeader, Panel, ProjectTable, RecentRuns, Stamp } from "@/components/Overview";
import { ProjectFields } from "@/components/ProjectFields";
import { ServiceFields } from "@/components/ServiceFields";
import { ServiceHeader } from "@/components/ServiceHeader";
import { VarsPanel } from "@/components/VarsPanel";
import { requestHash } from "@/lib/db";
import { METHODS } from "@/lib/methods";

// UI prototypes with mock data, no DB. Every new component lands here first. Dev only.

const PROJECTS = [
  { name: "Billing", services: 3, endpoints: 42 },
  { name: "Auth", services: 1, endpoints: 9 },
  { name: "Search", services: 2, endpoints: 17 },
  { name: "Notifications", services: 0, endpoints: 0 },
];

const SERVICES: { name: string; url: string; methods: Record<string, number> }[] = [
  { name: "invoices", url: "https://invoices.internal:8443", methods: { GET: 8, POST: 5, PUT: 2, PATCH: 1, DELETE: 2 } },
  { name: "payments", url: "http://localhost:4000", methods: { GET: 12, POST: 9 } },
  { name: "webhooks", url: "http://localhost:4100", methods: {} },
  { name: "probe", url: "http://localhost:4200", methods: { GET: 3, HEAD: 2, OPTIONS: 1 } },
];

// History rows for the workbench: 2xx/3xx/4xx/5xx, labeled and not.
const mockReq = (method: string, path: string, params: Record<string, string>, query: { key: string; value: string }[] = []) => ({
  method, path, params, query, headers: [], body: "", noAuth: false, skipHeaders: [],
});
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
// ids are the real request hash, so mockRun's requestId matches and Re-run moves the row up.
const mockHistory = [
  { id: "h1", label: "Happy path", locked: true, input: mockReq("PATCH", "/{{tenant}}/invoices/{id}", { id: "inv_123" }, [{ key: "expand", value: "lines" }]), status: 200, statusText: "OK", lastRunAt: minsAgo(2) },
  { id: "h2", input: mockReq("PATCH", "/{{tenant}}/invoices/{id}", { id: "inv_old" }), status: 301, statusText: "Moved Permanently", lastRunAt: minsAgo(45) },
  { id: "h3", input: mockReq("PATCH", "/{{tenant}}/invoices/{id}", { id: "nope" }, [{ key: "region", value: "{{region}}" }]), status: 404, statusText: "Not Found", lastRunAt: minsAgo(60 * 5) },
  { id: "h4", label: "Server blows up on empty body", input: mockReq("PATCH", "/{{tenant}}/invoices/{id}", { id: "inv_500" }), status: 500, statusText: "Internal Server Error", lastRunAt: minsAgo(60 * 24 * 3) },
].map((h) => ({ ...h, id: requestHash(h.input) }));

// Mocks of EditProjectModal / EditServiceModal: same fields and footer, mock action.
const mockEditProject = (name: string) => (
  <Modal title="Edit project" label="Edit project" triggerClass="btn-icon" trigger={<PencilIcon />}>
    <ActionForm action={mockSave} id={`dev-p-${name}`}>
      <ProjectFields p={{ name }} />
    </ActionForm>
    <ActionForm action={mockSave} confirm="Delete this project? (mock)" className={footer}>
      <button className="btn-danger">Delete project</button>
      <button form={`dev-p-${name}`} className="btn-primary">Save</button>
    </ActionForm>
  </Modal>
);

const mockEditService = (name: string, url: string) => {
  const u = new URL(url);
  return (
    <Modal title="Edit service" label="Edit service" triggerClass="btn-icon" trigger={<PencilIcon />}>
      <ActionForm action={mockSave} id={`dev-s-${name}`}>
        <ServiceFields
          s={{ name, protocol: u.protocol.slice(0, -1) as "http" | "https", host: u.hostname, port: Number(u.port), auth: { type: "bearer", token: "{{baseToken}}" } }}
          vars={DEV_VARS}
          warn={DEV_WARN}
        />
      </ActionForm>
      <ActionForm action={mockSave} confirm="Delete this service? (mock)" className={footer}>
        <button className="btn-danger">Delete service</button>
        <button form={`dev-s-${name}`} className="btn-primary">Save</button>
      </ActionForm>
    </Modal>
  );
};

const DEV_VARS = ["baseToken", "tenant", "api-key"];
const DEV_WARN = { baseToken: "2 endpoints capture this; Auth › Login wins" };

const ENDPOINTS = [
  ["GET", "/invoices", "List invoices"],
  ["GET", "/invoices/{id}", "Get invoice"],
  ["POST", "/invoices", "Create invoice"],
  ["PUT", "/invoices/{id}", "Replace invoice"],
  ["PATCH", "/invoices/{id}", "Update invoice"],
  ["DELETE", "/invoices/{id}", "Delete invoice"],
  ["POST", "/invoices/{id}/send", "Send invoice"],
].map(([method, path, name], i) => ({ id: String(i), href: "#", method, path, name }));

const ENDPOINTS_V2 = [
  ...ENDPOINTS,
  ...[
    ["GET", "/customers", "List customers"],
    ["GET", "/customers/{customerId}/invoices", "Invoices for customer"],
    ["POST", "/customers", "Create customer"],
    ["GET", "/", "Health check"],
  ].map(([method, path, name], i) => ({ id: `c${i}`, href: "#", method, path, name })),
  { id: "login", href: "#", method: "POST", path: "/auth/login", name: "Login", produces: ["accessToken"] },
];
const V2_COUNTS = Object.fromEntries(Object.entries(Object.groupBy(ENDPOINTS_V2, (e) => e.method)).map(([m, l]) => [m, l!.length]));

const v2Create = <EndpointModals serviceId="dev" create={mockSave} importSpec={mockSave} />;
const v2Actions = (
  <>
    {mockEditService("invoices-v2", "https://invoices.internal:8443")}
    {v2Create}
  </>
);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="border-b border-line pb-1 text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

const grid = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";

export default async function DevPage({ searchParams }: PageProps<"/dev">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { method, q } = await searchParams;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">UI prototypes</h1>
        <p className="text-sm text-muted">Mock data, dev only. Type “fail” as a name to see the error state.</p>
      </div>

      <Section title="Select (arrow fix)">
        <div className="flex flex-wrap gap-2">
          <select className="input">
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select className="input" defaultValue="https">
            <option value="http">http</option>
            <option value="https">https</option>
          </select>
          <select className="input" disabled>
            <option>disabled</option>
          </select>
        </div>
      </Section>

      <Section title="Back link (top of main content; hidden on /)">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {["/projects/p1", "/projects/p1/services/s1", "/projects/p1/services/s1/endpoints/e1"].map((path) => (
            <span key={path} className="flex items-center gap-2 font-mono text-xs text-subtle">
              <BackLink path={path} /> {path}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Delete confirmation (inline, outside a modal)">
        <ActionForm action={mockSave} confirm="Delete this endpoint? (mock)">
          <button className="btn-danger">Delete endpoint</button>
        </ActionForm>
      </Section>

      <Section title="Icon buttons">
        <div className="flex gap-2">
          <button className="btn-icon" aria-label="Edit" title="Edit">
            <PencilIcon />
          </button>
          <button className="btn-icon" aria-label="Add endpoint" title="Add endpoint">
            <PlusIcon />
          </button>
          <button className="btn-icon" aria-label="Import OpenAPI" title="Import OpenAPI">
            <UploadIcon />
          </button>
          <button className="btn-icon" aria-label="Disabled" disabled>
            <PencilIcon />
          </button>
        </div>
      </Section>

      <Section title="Overview: toolbar, stamps, project list + inspector">
        <OverviewHeader actions={<button className="btn-primary"><PlusIcon size={16} /> New project</button>} />
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stamp label="Projects" value={4} hue="red" Icon={SlidersIcon} note="latest: Billing" />
          <Stamp label="Services" value={6} hue="indigo" Icon={ServerIcon} note="across 4 projects" />
          <Stamp label="Endpoints" value={68} hue="cyan" Icon={PlugIcon} note="≈11 per service" />
          <Stamp label="Saved runs" value={0} hue="green" Icon={PlayIcon} note="nothing sent yet" />
        </dl>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Panel title="Projects" count={PROJECTS.length}>
            <ProjectTable rows={PROJECTS.map((p, i) => ({ id: p.name, ...p, createdAt: minsAgo(60 * 24 * (i * 9 + 1)), edit: mockEditProject(p.name) }))} />
          </Panel>
          <aside className="space-y-4">
            <Panel title="Method mix" count={68}>
              <MethodMix counts={{ GET: 31, POST: 19, PUT: 6, PATCH: 5, DELETE: 5, HEAD: 2 }} />
            </Panel>
            <Panel title="Recent runs">
              <RecentRuns
                runs={[200, 201, 404, 302, 500].map((status, i) => ({ id: String(i), href: "#", method: ["GET", "POST", "GET", "PATCH", "DELETE"][i], name: ["List invoices", "Create invoice", "Get invoice", "Update invoice", "Delete invoice"][i], where: "Billing › invoices", status, lastRunAt: minsAgo(i * i * 40 + 1) }))}
              />
            </Panel>
          </aside>
        </div>
        <p className="text-xs text-muted">Empty states:</p>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Panel title="Projects" count={0}>
            <ProjectTable rows={[]} empty={<><p className="font-medium text-fg">No projects yet</p><button className="btn">New project</button></>} />
          </Panel>
          <aside className="space-y-4">
            <Panel title="Method mix" count={0}><MethodMix counts={{}} /></Panel>
            <Panel title="Recent runs"><RecentRuns runs={[]} /></Panel>
          </aside>
        </div>
      </Section>

      <Section title="Project page: service cards + add placeholder">
        <div className={grid}>
          {SERVICES.map((s) => (
            <ServiceCard key={s.name} href="#" {...s} edit={mockEditService(s.name, s.url)} />
          ))}
          <AddCard label="New service">
            <ActionForm action={mockSave} reset className="flex flex-col gap-3">
              <ServiceFields vars={DEV_VARS} warn={DEV_WARN} />
              <div className="flex justify-end">
                <button className="btn">Add service</button>
              </div>
            </ActionForm>
          </AddCard>
        </div>
      </Section>

      <Section title="Service page: hero header + grouped, filterable endpoints">
        <ServiceHeader name="invoices" url="https://invoices.internal:8443/api/v1" counts={V2_COUNTS} actions={v2Actions} />
        <EndpointList rows={ENDPOINTS_V2} method={typeof method === "string" ? method : undefined} q={typeof q === "string" ? q : undefined} />
        <p className="text-xs text-muted">Empty service (http, no base path):</p>
        <ServiceHeader name="webhooks" url="http://localhost:4100" counts={{}} actions={v2Actions} />
        <EndpointList
          rows={[]}
          empty={<NoEndpoints>{v2Create}</NoEndpoints>}
        />
      </Section>

      <Section title="Project variables + headers">
        <p className="text-xs text-muted">Secret values are masked; the eye reveals them. Type “fail” as a name to see the error state. The Headers tab edits headers sent with every request.</p>
        <VarsPanel
          projectId="dev"
          vars={{ baseToken: { value: "eyJhbGciOiJIUzI1NiJ9.dev", secret: true }, tenant: { value: "acme" }, "api-key": { value: "k_live_123", secret: true } }}
          headers={[{ key: "X-Tenant", value: "{{tenant}}" }, { key: "Accept", value: "application/json" }]}
          save={mockSave}
          remove={mockSave}
          saveHeaders={mockSave}
        />
        <p className="text-xs text-muted">Empty project:</p>
        <VarsPanel projectId="dev" vars={{}} save={mockSave} remove={mockSave} saveHeaders={mockSave} />
      </Section>

      <Section title="Endpoint page: request bar + request/response panels">
        <p className="text-xs text-muted">Send, then hover a PLAIN row or response header and click {"{{ }}"} to save it as a variable (data.access_token → {"{{accessToken}}"}); the Captures tab lists and edits the rules (a variable named “fail” errors).</p>
        <p className="text-xs text-muted">The Auth tab shows the service’s Bearer {"{{accessToken}}"} (undefined here, so flagged red) and a No auth toggle. Set the path to include “fail” for a network error, “missing” for a 404, “expired” for a token refresh badge or “relogin” for a failed refresh. ⌘↵ sends, ⌘S saves.</p>
        <EndpointWorkbench
          id="dev"
          baseUrl="https://invoices.internal:8443/api/v1"
          initial={{
            method: "PATCH",
            path: "/{{tenant}}/invoices/{id}",
            name: "Update invoice",
            description: "Updates an invoice. Paid invoices are locked.",
            query: [{ key: "expand", value: "lines" }, { key: "region", value: "{{region}}" }],
            headers: [{ key: "Authorization", value: "Bearer {{baseToken}}" }],
            body: '{\n  "status": "paid"\n}',
            noAuth: false,
            skipHeaders: ["Accept"],
          }}
          projectHeaders={[{ key: "X-Tenant", value: "{{tenant}}" }, { key: "Accept", value: "application/json" }]}
          vars={["baseToken", "tenant"]}
          auth={{ type: "bearer", token: "{{accessToken}}" }}
          serviceHref="#"
          captures={[{ var: "requestId", from: "header", path: "x-request-id" }]}
          run={mockRun}
          save={mockSave}
          capture={mockCapture}
          uncapture={mockUncapture}
          rename={mockRename}
          lock={mockLock}
          remove={mockRemove}
          history={mockHistory}
          actions={
            <ActionForm action={mockSave} confirm="Delete this endpoint? (mock)">
              <button className="btn-icon hover:text-[var(--c-red)]" aria-label="Delete endpoint" title="Delete endpoint">
                <TrashIcon />
              </button>
            </ActionForm>
          }
        />
      </Section>
    </>
  );
}
