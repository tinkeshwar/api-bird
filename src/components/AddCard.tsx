import { PlusIcon } from "@/components/Icons";
import { Modal } from "@/components/Modal";

// Dashed placeholder sitting in the grid slot where the next card would go; opens a modal.
export function AddCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Modal
      title={label}
      trigger={
        <>
          <PlusIcon size={20} />
          <span className="text-sm">{label}</span>
        </>
      }
      triggerClass="card items-center justify-center border-dashed border-line-strong bg-surface/50 text-muted shadow-none transition-colors hover:border-accent hover:text-accent-text"
    >
      {children}
    </Modal>
  );
}
