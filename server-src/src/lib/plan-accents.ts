// Distinct accent colour per plan — shared by the marketing plan cards and the
// dashboard purchase cards so both stay in sync.
export const PLAN_ACCENTS: Record<string, string> = {
  'gold-500': '#84CC16',
  'gold-1k': '#C9A227',
  'gold-3k': '#2FBE87',
  'gold-5k': '#38BDF8',
  'gold-10k': '#A78BFA',
  'gold-15k': '#FB7185',
  'gold-25k': '#FB923C',
  'gold-50k': '#22D3EE',
  'gold-100k': '#818CF8',
  'gold-200k': '#E879F9',
};

export function planAccent(slug: string): string {
  return PLAN_ACCENTS[slug] ?? '#C9A227';
}
