import { notFound } from "next/navigation";
import { createService } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { AddCard } from "@/components/AddCard";
import { ServiceCard } from "@/components/Cards";
import { EditServiceModal } from "@/components/EditModals";
import { ServiceFields } from "@/components/ServiceFields";
import { endpoints, oid, projects, serviceUrl, services } from "@/lib/db";
import { METHODS } from "@/lib/methods";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const id = oid((await params).id);
  const project = id && (await (await projects()).findOne({ _id: id }));
  if (!project) notFound();
  const list = await (await services()).find({ projectId: project._id }).sort({ createdAt: 1 }).toArray();
  const counts = await (await endpoints())
    .aggregate<{ _id: { s: unknown; m: string }; n: number }>([
      { $match: { serviceId: { $in: list.map((s) => s._id) } } },
      { $group: { _id: { s: "$serviceId", m: "$method" }, n: { $sum: 1 } } },
    ])
    .toArray();
  // service id → { method: count }, keys in METHODS order so every card lists them the same way.
  const byMethod = new Map<string, Record<string, number>>();
  for (const c of counts.sort((a, b) => METHODS.indexOf(a._id.m) - METHODS.indexOf(b._id.m))) {
    const k = String(c._id.s);
    byMethod.set(k, { ...byMethod.get(k), [c._id.m]: c.n });
  }
  const pid = String(project._id);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => (
          <ServiceCard
            key={String(s._id)}
            href={`/projects/${pid}/services/${s._id}`}
            name={s.name}
            url={serviceUrl(s)}
            methods={byMethod.get(String(s._id)) ?? {}}
            edit={<EditServiceModal id={String(s._id)} s={s} />}
          />
        ))}
        <AddCard label="New service">
          <ActionForm action={createService} reset className="flex flex-col gap-3">
            <input type="hidden" name="projectId" value={pid} />
            <ServiceFields />
            <div className="flex justify-end">
              <button className="btn">Add service</button>
            </div>
          </ActionForm>
        </AddCard>
      </div>
    </>
  );
}
