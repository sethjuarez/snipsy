import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Button from "./ui/Button";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  testId?: string;
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  tip?: ReactNode;
  "data-testid"?: string;
}

function EmptyState({ icon: Icon, title, description, action, tip, "data-testid": testId }: EmptyStateProps) {
  return (
    <div className="text-center py-12" style={{ color: "var(--color-text-secondary)" }} data-testid={testId}>
      {Icon && <Icon size={32} className="mx-auto mb-3 opacity-40" />}
      <p className="text-md">{title}</p>
      {description && <p className="text-base mt-1">{description}</p>}
      {action && (
        <Button
          tone="primary"
          icon={action.icon}
          onClick={action.onClick}
          className="mt-4 px-3 py-1.5"
          data-testid={action.testId}
        >
          {action.label}
        </Button>
      )}
      {tip && <p className="text-sm mt-4 opacity-80">{tip}</p>}
    </div>
  );
}

export default EmptyState;
