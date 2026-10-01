export type SessionMix = {
  named: number;
  withReviews: number;
  withWebsite: number;
  noWebsite: number;
};

export function emptySessionMix(): SessionMix {
  return { named: 0, withReviews: 0, withWebsite: 0, noWebsite: 0 };
}

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function sessionPercents(mix: SessionMix) {
  const leads = mix.withWebsite + mix.noWebsite;
  return {
    nameRatePct: pct(mix.named, mix.withReviews),
    websitePct: pct(mix.withWebsite, leads),
    noWebsitePct: pct(mix.noWebsite, leads),
    leads,
  };
}

export function formatSessionMixLog(mix: SessionMix): string {
  const p = sessionPercents(mix);
  return `This session: name detection ${p.nameRatePct}% (${mix.named}/${mix.withReviews} shops with review text). Website ${p.websitePct}% have a site, ${p.noWebsitePct}% do not (${mix.withWebsite} with / ${mix.noWebsite} without).`;
}
