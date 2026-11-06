import type { Page } from '@/lib/api';

export function Pagination({
  page,
  onChange,
}: {
  page: Pick<Page<unknown>, 'page' | 'pageSize' | 'total'>;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  if (pages === 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-end gap-3 text-sm">
      <button
        type="button"
        className="btn-secondary"
        disabled={page.page <= 1}
        onClick={() => onChange(page.page - 1)}
      >
        Previous
      </button>
      <span className="text-zinc-500">
        Page {page.page} of {pages}
      </span>
      <button
        type="button"
        className="btn-secondary"
        disabled={page.page >= pages}
        onClick={() => onChange(page.page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
