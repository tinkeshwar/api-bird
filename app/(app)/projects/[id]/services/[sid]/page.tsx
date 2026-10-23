import { notFound } from "next/navigation";
import { EditServiceModal } from "@/components/EditModals";
import { EndpointList } from "@/components/EndpointList";
import { EndpointModals, NoEndpoints } from "@/components/EndpointModals";
import { ServiceHeader } from "@/components/ServiceHeader";
import { endpoints, oid, serviceUrl, services } from "@/lib/db";

export default async function ServicePage({ params, searchParams }: PageProps<"/projects/[id]/services/[sid]">) {
  const { id, sid } = await params;
  const { method, q } = await searchParams;
  const pid = oid(id);
  const svcId = oid(sid);
  const svc = pid && svcId && (await (await services()).findOne({ _id: svcId, projectId: pid }));
  if (!svc) notFound();
  const list = await (await endpoints()).find({ serviceId: svc._id }).sort({ path: 1, method: 1 }).toArray();
  const base = `/projects/${id}/services/${sid}`;
  const counts = Object.fromEntries(Object.entries(Object.groupBy(list, (e) => e.method)).map(([m, l]) => [m, l!.length]));

  return (
    <>
      <ServiceHeader
        name={svc.name}
        url={serviceUrl(svc)}
        counts={counts}
        actions={
          <>
            <EditServiceModal id={sid} s={svc} />
            <EndpointModals serviceId={sid} />
          </>
        }
      />
      <EndpointList
        rows={list.map((e) => ({ id: String(e._id), href: `${base}/endpoints/${e._id}`, method: e.method, path: e.path, name: e.name }))}
        method={typeof method === "string" ? method : undefined}
        q={typeof q === "string" ? q : undefined}
        empty={
          <NoEndpoints>
            <EndpointModals serviceId={sid} />
          </NoEndpoints>
        }
      />
    </>
  );
}
