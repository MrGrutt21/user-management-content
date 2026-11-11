'use client';

type Props = {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function ClientsPager({ page, totalPages, total, onPageChange }: Props) {
  const isFirst = page <= 1;
  const isLast = page >= totalPages;
  return (
    <nav className="pager" aria-label="Pagination">
      <button type="button" disabled={isFirst} onClick={() => onPageChange(1)}>
        First
      </button>
      {/* min(): from a hand-typed page past the end, Prev goes to the real last page. */}
      <button type="button" disabled={isFirst} onClick={() => onPageChange(Math.min(page - 1, totalPages))}>
        Prev
      </button>
      <span aria-live="polite">
        Page {page} of {totalPages} · {total.toLocaleString()} clients
      </span>
      <button type="button" disabled={isLast} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
      <button type="button" disabled={isLast} onClick={() => onPageChange(totalPages)}>
        Last
      </button>
    </nav>
  );
}
