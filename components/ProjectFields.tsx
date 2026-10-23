import { ProjectIcon } from "@/components/ProjectIcon";

const file =
  "min-w-0 text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg hover:file:bg-surface-2";

// Shared by the "New project" card and the edit modal; `p` shows the current icon as a preview.
export function ProjectFields({ p }: { p?: { name: string; icon?: string } }) {
  return (
    <div className="grid gap-3">
      <label className="label">
        Name
        <input name="name" placeholder="Project name" defaultValue={p?.name} className="input w-full" />
      </label>
      <label className="label">
        {p ? "Change icon" : "Icon"}
        <span className="flex items-center gap-3">
          {p && <ProjectIcon icon={p.icon} name={p.name} size={40} />}
          <input name="icon" type="file" accept="image/*" className={file} />
        </span>
      </label>
    </div>
  );
}
