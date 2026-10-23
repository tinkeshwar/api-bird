import Link from "next/link";
import { ChevronRightIcon } from "@/components/Icons";
import { ProjectIcon } from "@/components/ProjectIcon";
import { oid, projects } from "@/lib/db";

// Navbar breadcrumb for every page under /projects/[id].
export default async function ProjectCrumb({ params }: { params: Promise<{ id: string }> }) {
  const id = oid((await params).id);
  const project = id && (await (await projects()).findOne({ _id: id }));
  if (!project) return null;
  return (
    <>
      <span className="flex px-1 text-muted">
        <ChevronRightIcon />
      </span>
      <Link href={`/projects/${project._id}`} className="group flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 font-semibold transition-colors hover:bg-surface-2">
        <ProjectIcon icon={project.icon} name={project.name} size={24} />
        {project.name}
      </Link>
    </>
  );
}
