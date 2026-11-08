// Centered section heading flanked by two glowing green rules.
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-5">
      <span className="h-0.5 w-12 rounded-full bg-gradient-to-r from-transparent via-brand-400 to-transparent shadow-[0_0_8px_rgba(46,235,158,0.8)] sm:w-20" />
      <h2 className="text-center font-display text-2xl font-extrabold text-white sm:text-[1.75rem]">
        {children}
      </h2>
      <span className="h-0.5 w-12 rounded-full bg-gradient-to-r from-transparent via-brand-400 to-transparent shadow-[0_0_8px_rgba(46,235,158,0.8)] sm:w-20" />
    </div>
  );
}
