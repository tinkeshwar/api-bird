import { connection } from "next/server";
import { createProject } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { EditProjectModal } from "@/components/EditModals";
import { PlayIcon, PlugIcon, PlusIcon, ServerIcon, SlidersIcon } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { MethodMix, OverviewHeader, Panel, ProjectTable, RecentRuns, Stamp } from "@/components/Overview";
import { ProjectFields } from "@/components/ProjectFields";
import { endpoints, projects, requests, services } from "@/lib/db";

const newProject = (triggerClass: string) => (
  <Modal
    title="New project"
    triggerClass={triggerClass}
    trigger={
      <>
        <PlusIcon size={16} /> New project
      </>
    }
  >
    <ActionForm action={createProject} reset className="flex flex-col gap-3">
      <ProjectFields />
      <div className="flex justify-end">
        <button className="btn-primary">Create</button>
      </div>
    </ActionForm>
  </Modal>
);

export default async function Home() {
  await connection();
  const [list, svcs, eps, recent, runCount] = await Promise.all([
    (await projects()).find({}, { projection: { vars: 0, headers: 0 } }).sort({ createdAt: -1 }).toArray(),
    (await services()).find({}, { projection: { projectId: 1, name: 1 } }).toArray(),
    (await endpoints()).find({}, { projection: { serviceId: 1, method: 1 } }).toArray(),
    (await requests()).find({}, { projection: { endpointId: 1, status: 1, lastRunAt: 1 } }).sort({ lastRunAt: -1 }).limit(6).toArray(),
    (await requests()).estimatedDocumentCount(),
  ]);
  const runEps = await (await endpoints())
    .find({ _id: { $in: recent.map((r) => r.endpointId) } }, { projection: { name: 1, method: 1, serviceId: 1 } })
    .toArray();

  // The service list doubles as the service → project map, so endpoint counts roll up without another query.
  const svcOf = new Map(svcs.map((s) => [String(s._id), s]));
  const projOf = new Map(list.map((p) => [String(p._id), p]));
  const svcCount = new Map<string, number>();
  const epCount = new Map<string, number>();
  const byMethod: Record<string, number> = {};
  for (const s of svcs) svcCount.set(String(s.projectId), (svcCount.get(String(s.projectId)) ?? 0) + 1);
  for (const e of eps) {
    byMethod[e.method] = (byMethod[e.method] ?? 0) + 1;
    const p = svcOf.get(String(e.serviceId))?.projectId;
    if (p) epCount.set(String(p), (epCount.get(String(p)) ?? 0) + 1);
  }
  const epTotal = eps.length;

  // Runs whose endpoint, service or project was deleted drop out.
  const runs = recent.flatMap((r) => {
    const ep = runEps.find((e) => e._id.equals(r.endpointId));
    const svc = ep && svcOf.get(String(ep.serviceId));
    const p = svc && projOf.get(String(svc.projectId));
    if (!p) return [];
    return [{ id: String(r._id), href: `/projects/${p._id}/services/${svc._id}/endpoints/${ep._id}`, method: ep.method, name: ep.name, where: `${p.name} › ${svc.name}`, status: r.status, lastRunAt: r.lastRunAt.toISOString() }];
  });

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const stamps = [
    { label: "Projects", value: list.length, hue: "red", Icon: SlidersIcon, note: list[0] ? `latest: ${list[0].name}` : "none yet" },
    { label: "Services", value: svcs.length, hue: "indigo", Icon: ServerIcon, note: `across ${plural(list.length, "project")}` },
    { label: "Endpoints", value: epTotal, hue: "cyan", Icon: PlugIcon, note: svcs.length ? `≈${Math.round(epTotal / svcs.length)} per service` : "import an OpenAPI spec" },
    { label: "Saved runs", value: runCount, hue: "green", Icon: PlayIcon, note: runs[0] ? `last ${runs[0].status}` : "nothing sent yet" },
  ];

  return (
    <>
      <OverviewHeader actions={newProject("btn-primary")} />

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stamps.map((s, i) => (
          <Stamp key={s.label} {...s} delay={60 + i * 50} />
        ))}
      </dl>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Panel title="Projects" count={list.length}>
          <ProjectTable
            rows={list.map((p) => {
              const id = String(p._id);
              return { id, name: p.name, icon: p.icon, services: svcCount.get(id) ?? 0, endpoints: epCount.get(id) ?? 0, createdAt: p.createdAt.toISOString(), edit: <EditProjectModal id={id} name={p.name} icon={p.icon} /> };
            })}
            empty={
              <>
                <img src="/logo.svg" alt="" className="h-20 w-auto opacity-80" />
                <p className="font-medium text-fg">No projects yet</p>
                <p className="max-w-xs text-sm text-muted">A project groups the services you call and the variables they share.</p>
                {newProject("btn")}
              </>
            }
          />
        </Panel>

        <aside className="space-y-4">
          <Panel title="Method mix" count={epTotal}>
            <MethodMix counts={byMethod} />
          </Panel>
          <Panel title="Recent runs">
            <RecentRuns runs={runs} />
          </Panel>
        </aside>
      </div>
    </>
  );
}
