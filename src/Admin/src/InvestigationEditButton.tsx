type InvestigationEditButtonProps = {
  editing: boolean;
  onClick: () => void;
};

export function InvestigationEditButton({ editing, onClick }: InvestigationEditButtonProps) {
  if (editing) return null;

  return (
    <button
      type="button"
      className="edit-icon section-edit-icon"
      title="Redigera insats"
      aria-label="Redigera insats"
      onClick={onClick}
    >
      ✎
    </button>
  );
}
