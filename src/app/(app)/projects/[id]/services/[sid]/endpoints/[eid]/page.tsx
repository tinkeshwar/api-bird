import { notFound } from "next/navigation";
import { deleteEndpoint } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { EndpointWorkbench } from "@/components/EndpointWorkbench";
import { TrashIcon } from "@/components/Icons";
import { endpoints, oid, producers, projects, requests, serviceUrl, services } from "@/lib/db";

export default async function EndpointPage({ params }: PageProps<"/projects/[id]/services/[sid]/endpoints/[eid]">) {
  const { id, sid, eid } = await params;
  const svcId = oid(sid);
  const epId = oid(eid);
  const ep = svcId && epId && (await (await endpoints()).findOne({ _id: epId, serviceId: svcId }));
  if (!ep) notFound();
  const svc = await (await services()).findOne({ _id: ep.serviceId });
  if (!svc) notFound();
  const project = await (await projects()).findOne({ _id: svc.projectId }, { projection: { vars: 1, headers: 1 } });
  const history = (await (await requests()).find({ endpointId: ep._id }).sort({ lastRunAt: -1 }).toArray()).map((r) => ({
    id: String(r._id),
    label: r.label,
    locked: r.locked,
    input: r.input,
    status: r.status,
    statusText: r.statusText,
    lastRunAt: r.lastRunAt.toISOString(),
  }));

  return (
    <EndpointWorkbench
      id={eid}
      baseUrl={serviceUrl(svc)}
      vars={[...Object.keys(project?.vars ?? {}), ...(await producers(svc.projectId)).keys()]}
      auth={svc.auth}
      projectHeaders={project?.headers}
      serviceHref={`/projects/${id}/services/${sid}`}
      captures={ep.captures}
      history={history}
      initial={{
        method: ep.method,
        path: ep.path,
        name: ep.name,
        description: ep.description ?? "",
        headers: ep.headers,
        query: ep.query,
        body: ep.body ?? "",
        noAuth: !!ep.noAuth,
        skipHeaders: ep.skipHeaders ?? [],
      }}
      actions={
        <ActionForm action={deleteEndpoint} confirm="Delete this endpoint?">
          <input type="hidden" name="id" value={eid} />
          <button className="btn-icon hover:text-[var(--c-red)]" aria-label="Delete endpoint" title="Delete endpoint">
            <TrashIcon />
          </button>
        </ActionForm>
      }
    />
  );
}
