import { connection } from "next/server";
import { createProject } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { AddCard } from "@/components/AddCard";
import { ProjectCard } from "@/components/Cards";
import { EditProjectModal } from "@/components/EditModals";
import { ProjectFields } from "@/components/ProjectFields";
import { endpoints, projects, services } from "@/lib/db";

export default async function Home() {
  await connection();
  const [list, svcs, eps] = await Promise.all([
    (await projects()).find().sort({ createdAt: -1 }).toArray(),
    (await services()).find({}, { projection: { projectId: 1 } }).toArray(),
    (await endpoints()).aggregate<{ _id: unknown; n: number }>([{ $group: { _id: "$serviceId", n: { $sum: 1 } } }]).toArray(),
  ]);

  // The service list doubles as the service → project map, so endpoint counts roll up without a third query.
  const projectOf = new Map(svcs.map((s) => [String(s._id), String(s.projectId)]));
  const svcCount = new Map<string, number>();
  const epCount = new Map<string, number>();
  for (const s of svcs) svcCount.set(String(s.projectId), (svcCount.get(String(s.projectId)) ?? 0) + 1);
  for (const e of eps) {
    const p = projectOf.get(String(e._id));
    if (p) epCount.set(p, (epCount.get(p) ?? 0) + e.n);
  }

  const stats = [
    { label: "Projects", value: list.length, hue: "indigo" },
    { label: "Services", value: svcs.length, hue: "violet" },
    { label: "Endpoints", value: eps.reduce((s, e) => s + e.n, 0), hue: "cyan" },
  ];

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6 pt-12">
      <div className="hero-bg" aria-hidden />
      <div className="rise pt-4 pb-2">
        <h1 className="mb-3 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
          Every API, <span className="text-gradient">one nest</span>
        </h1>
        <p className="text-lg text-muted">Organise projects, services and endpoints, then run them right here.</p>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {stats.map((s, i) => {
          const c = `var(--c-${s.hue})`;
          return (
            <div key={s.label} className="card rise min-h-0 flex-row items-center gap-3" style={{ animationDelay: `${60 + i * 50}ms` }}>
              <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold sm:inline-flex" style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
                {s.label[0]}
              </span>
              <div>
                <dd className="text-2xl leading-none font-semibold text-fg tabular-nums">{s.value}</dd>
                <dt className="mt-1 text-xs font-medium text-muted">{s.label}</dt>
              </div>
            </div>
          );
        })}
      </dl>

      <h2 className="pt-4 text-sm font-semibold tracking-wider text-subtle uppercase">Projects</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => {
          const id = String(p._id);
          return <ProjectCard key={id} href={`/projects/${id}`} name={p.name} icon={p.icon} services={svcCount.get(id) ?? 0} endpoints={epCount.get(id) ?? 0} edit={<EditProjectModal id={id} name={p.name} icon={p.icon} />} />;
        })}
        <AddCard label="New project">
          <ActionForm action={createProject} reset className="flex flex-col gap-3">
            <ProjectFields />
            <div className="flex justify-end">
              <button className="btn">Create</button>
            </div>
          </ActionForm>
        </AddCard>
      </div>
    </main>
  );
}
