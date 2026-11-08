import Image from 'next/image';
import type { Dictionary } from '@/i18n';
import { FaqAccordion } from './FaqAccordion';
import { SectionTitle } from './SectionTitle';

export function HomeFaq({ dict }: { dict: Dictionary }) {
  const v = dict.home.v2;
  return (
    <section className="container-x mt-14">
      <SectionTitle>{v.faqTitle}</SectionTitle>
      <div className="mt-8 grid items-center gap-6 lg:grid-cols-[1fr_240px]">
        <FaqAccordion items={v.faq} />
        <div className="hidden justify-center lg:flex">
          <Image
            src="/images/home/faq-q.jpg"
            alt=""
            width={400}
            height={290}
            className="h-auto w-[220px] mix-blend-multiply"
            style={{
              maskImage: 'radial-gradient(closest-side, #000 72%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(closest-side, #000 72%, transparent 100%)',
            }}
          />
        </div>
      </div>
    </section>
  );
}
