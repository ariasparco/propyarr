import type { ReactNode } from 'react';

export function AdminTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-xs text-white/40">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3.5 text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">{children}</tbody>
      </table>
      {empty && (
        <p className="px-4 py-10 text-center text-sm text-white/40">—</p>
      )}
    </div>
  );
}
