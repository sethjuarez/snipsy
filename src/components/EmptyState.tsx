import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  "data-testid"?: string;
}

function EmptyState({ icon: Icon, title, description, "data-testid": testId }: EmptyStateProps) {
  return (
    <div className="text-center py-12" style={{ color: "var(--color-text-secondary)" }} data-testid={testId}>
      {Icon && <Icon size={32} className="mx-auto mb-3 opacity-40" />}
      <p className="text-[13px]">{title}</p>
      {description && <p className="text-[12px] mt-1">{description}</p>}
    </div>
  );
}

export default EmptyState;
