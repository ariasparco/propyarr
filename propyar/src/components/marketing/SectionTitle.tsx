// Centered section heading flanked by two short green rules.
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-4">
      <span className="h-[3px] w-12 rounded-full bg-gradient-to-l from-brand-500 to-brand-500/0 sm:w-20" />
      <h2 className="text-center font-display text-2xl font-black text-white sm:text-[1.75rem]">
        {children}
      </h2>
      <span className="h-[3px] w-12 rounded-full bg-gradient-to-r from-brand-500 to-brand-500/0 sm:w-20" />
    </div>
  );
}
