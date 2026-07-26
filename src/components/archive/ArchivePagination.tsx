import React from "react";

interface ArchivePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function ArchivePagination({
  currentPage,
  totalPages,
  onPageChange,
}: ArchivePaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-8 mt-10 border-t border-[var(--border-color)]">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] bg-[var(--bg-card)] hover:border-[var(--accent-copper)] hover:text-[var(--accent-copper)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        ← Previous Page
      </button>

      <span className="text-xs text-[var(--text-secondary)]">
        Page <span className="text-[var(--text-primary)] font-semibold">{currentPage}</span> of{" "}
        <span className="text-[var(--text-primary)] font-semibold">{totalPages}</span>
      </span>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] bg-[var(--bg-card)] hover:border-[var(--accent-copper)] hover:text-[var(--accent-copper)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        Next Page →
      </button>
    </div>
  );
}