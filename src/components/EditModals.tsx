import { deleteProject, deleteService, updateProject, updateService } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { PencilIcon } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { ProjectFields } from "@/components/ProjectFields";
import { ServiceFields, type ServiceInit } from "@/components/ServiceFields";

export const footer = "flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4";

export function EditProjectModal({ id, name, icon }: { id: string; name: string; icon?: string }) {
  return (
    <Modal title="Edit project" label="Edit project" triggerClass="btn-icon" trigger={<PencilIcon />}>
      <ActionForm action={updateProject} id={`edit-project-${id}`} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={id} />
        <ProjectFields p={{ name, icon }} />
      </ActionForm>
      <ActionForm action={deleteProject} confirm="Delete this project, its services and endpoints?" className={footer}>
        <input type="hidden" name="id" value={id} />
        <button className="btn-danger">Delete project</button>
        <button form={`edit-project-${id}`} className="btn-primary">Save</button>
      </ActionForm>
    </Modal>
  );
}

export function EditServiceModal({ id, s, vars, warn }: { id: string; s: ServiceInit; vars?: string[]; warn?: Record<string, string> }) {
  return (
    <Modal title="Edit service" label="Edit service" triggerClass="btn-icon" trigger={<PencilIcon />}>
      <ActionForm action={updateService} id={`edit-service-${id}`} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={id} />
        {/* Picked field by field: s may be a full Mongo doc, and ObjectIds can't cross into a client component. */}
        <ServiceFields s={{ name: s.name, protocol: s.protocol, host: s.host, port: s.port, basePath: s.basePath, auth: s.auth }} vars={vars} warn={warn} />
      </ActionForm>
      <ActionForm action={deleteService} confirm="Delete this service and its endpoints?" className={footer}>
        <input type="hidden" name="id" value={id} />
        <button className="btn-danger">Delete service</button>
        <button form={`edit-service-${id}`} className="btn-primary">Save</button>
      </ActionForm>
    </Modal>
  );
}
