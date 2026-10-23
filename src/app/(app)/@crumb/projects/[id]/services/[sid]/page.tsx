import Link from "next/link";
import { ChevronRightIcon } from "@/components/Icons";
import { oid, services } from "@/lib/db";
import ProjectCrumb from "../../page";

// Project crumb plus the service; endpoint crumb pages re-export this.
export default async function ServiceCrumb({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  const pid = oid(id);
  const svcId = oid(sid);
  const svc = pid && svcId && (await (await services()).findOne({ _id: svcId, projectId: pid }));
  return (
    <>
      <ProjectCrumb params={params} />
      {svc && (
        <>
          <span className="flex px-1 text-muted">
            <ChevronRightIcon />
          </span>
          <Link href={`/projects/${id}/services/${sid}`} className="rounded-lg px-2 py-1 font-semibold transition-colors hover:bg-surface-2">
            {svc.name}
          </Link>
        </>
      )}
    </>
  );
}
