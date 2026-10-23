import { notFound } from "next/navigation";
import { deleteEndpoint } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { EndpointWorkbench } from "@/components/EndpointWorkbench";
import { TrashIcon } from "@/components/Icons";
import { endpoints, oid, projects, serviceUrl, services } from "@/lib/db";

export default async function EndpointPage({ params }: PageProps<"/projects/[id]/services/[sid]/endpoints/[eid]">) {
  const { sid, eid } = await params;
  const svcId = oid(sid);
  const epId = oid(eid);
  const ep = svcId && epId && (await (await endpoints()).findOne({ _id: epId, serviceId: svcId }));
  if (!ep) notFound();
  const svc = await (await services()).findOne({ _id: ep.serviceId });
  if (!svc) notFound();
  const project = await (await projects()).findOne({ _id: svc.projectId }, { projection: { vars: 1 } });

  return (
    <EndpointWorkbench
      id={eid}
      baseUrl={serviceUrl(svc)}
      vars={Object.keys(project?.vars ?? {})}
      initial={{
        method: ep.method,
        path: ep.path,
        name: ep.name,
        headers: ep.headers,
        query: ep.query,
        body: ep.body ?? "",
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
