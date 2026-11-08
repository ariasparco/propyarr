export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <section className="relative overflow-hidden border-b border-brand-400/10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(40rem 20rem at 50% -8rem, rgba(46,235,158,0.10), transparent 70%), radial-gradient(34rem 20rem at 100% 0%, rgba(9,54,36,0.35), transparent 70%)',
        }}
      />
      <div className="container-x py-12 text-center sm:py-14">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mx-auto mt-3 max-w-3xl font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-5 max-w-2xl text-lg text-white/55">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
