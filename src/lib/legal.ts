export const LEGAL = {
  owner: "168",
  email: "168webapp@gmail.com",
  site: "https://168-theta.vercel.app",
  updated: "2 de octubre de 2026",
  minAge: 13,
} as const;

/** Bump when the Terms or Privacy Policy change in a way users must re-accept. */
export const TERMS_VERSION = "2026-10-02";

/** Stored in the user's auth metadata as the record of their consent. */
export const consentMetadata = () => ({
  terms_version: TERMS_VERSION,
  terms_accepted_at: new Date().toISOString(),
  age_confirmed_min: LEGAL.minAge,
});

export const hasAcceptedTerms = (metadata: Record<string, unknown> | undefined) =>
  metadata?.["terms_version"] === TERMS_VERSION;
