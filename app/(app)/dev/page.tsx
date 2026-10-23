import { notFound } from "next/navigation";
import { mockRun, mockSave } from "@/app/(app)/dev/actions";
import { ActionForm } from "@/components/ActionForm";
import { AddCard } from "@/components/AddCard";
import { ProjectCard, ServiceCard } from "@/components/Cards";
import { PencilIcon, PlusIcon, TrashIcon, UploadIcon } from "@/components/Icons";
import { footer } from "@/components/EditModals";
import { EndpointList } from "@/components/EndpointList";
import { EndpointModals, NoEndpoints } from "@/components/EndpointModals";
import { EndpointWorkbench } from "@/components/EndpointWorkbench";
import { Modal } from "@/components/Modal";
import { ProjectFields } from "@/components/ProjectFields";
import { ServiceFields } from "@/components/ServiceFields";
import { ServiceHeader } from "@/components/ServiceHeader";
import { VarsPanel } from "@/components/VarsPanel";
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
        <ServiceFields s={{ name, protocol: u.protocol.slice(0, -1) as "http" | "https", host: u.hostname, port: Number(u.port) }} />
      </ActionForm>
      <ActionForm action={mockSave} confirm="Delete this service? (mock)" className={footer}>
        <button className="btn-danger">Delete service</button>
        <button form={`dev-s-${name}`} className="btn-primary">Save</button>
      </ActionForm>
    </Modal>
  );
};

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

      <Section title="Landing: project cards + add placeholder">
        <div className={grid}>
          {PROJECTS.map((p) => (
            <ProjectCard key={p.name} href="#" {...p} edit={mockEditProject(p.name)} />
          ))}
          <AddCard label="New project">
            <ActionForm action={mockSave} reset className="flex flex-col gap-3">
              <ProjectFields />
              <div className="flex justify-end">
                <button className="btn">Create</button>
              </div>
            </ActionForm>
          </AddCard>
        </div>
        <p className="text-xs text-muted">Empty state: only the placeholder.</p>
        <div className={grid}>
          <AddCard label="New project">
            <p className="text-sm text-muted">(same form)</p>
          </AddCard>
        </div>
      </Section>

      <Section title="Project page: service cards + add placeholder">
        <div className={grid}>
          {SERVICES.map((s) => (
            <ServiceCard key={s.name} href="#" {...s} edit={mockEditService(s.name, s.url)} />
          ))}
          <AddCard label="New service">
            <ActionForm action={mockSave} reset className="flex flex-col gap-3">
              <ServiceFields />
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

      <Section title="Project variables">
        <p className="text-xs text-muted">Secret values are masked; the eye reveals them. Type “fail” as a name to see the error state.</p>
        <VarsPanel
          projectId="dev"
          vars={{ baseToken: { value: "eyJhbGciOiJIUzI1NiJ9.dev", secret: true }, tenant: { value: "acme" }, "api-key": { value: "k_live_123", secret: true } }}
          save={mockSave}
          remove={mockSave}
        />
        <p className="text-xs text-muted">Empty project:</p>
        <VarsPanel projectId="dev" vars={{}} save={mockSave} remove={mockSave} />
      </Section>

      <Section title="Endpoint page: request bar + request/response panels">
        <p className="text-xs text-muted">Set the path to include “fail” for a network error or “missing” for a 404. ⌘↵ sends, ⌘S saves.</p>
        <EndpointWorkbench
          id="dev"
          baseUrl="https://invoices.internal:8443/api/v1"
          initial={{
            method: "PATCH",
            path: "/{{tenant}}/invoices/{id}",
            name: "Update invoice",
            query: [{ key: "expand", value: "lines" }, { key: "region", value: "{{region}}" }],
            headers: [{ key: "Authorization", value: "Bearer {{baseToken}}" }],
            body: '{\n  "status": "paid"\n}',
          }}
          vars={["baseToken", "tenant"]}
          run={mockRun}
          save={mockSave}
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
