// Single source of truth for Sticks' public business identity. Used by
// the marketing landing, About, Contact, Privacy, Terms, the SMS opt-in
// page, and site metadata so the same legal name / contact details show
// everywhere (which is exactly what SMS and app-store reviewers check
// for consistency).
//
// NOTE for the operator: `email` must be a mailbox that actually
// receives mail on the sticks-golf.app domain (a real inbox or a
// forwarding alias to your personal inbox). A domain-matched address is
// what carriers/reviewers expect over a personal gmail/aol address.

export const BUSINESS = {
  name: "Sticks",
  // Registered/legal operator. Sole proprietorship.
  legalName: "Sticks",
  proprietor: "Andrew Carcich",
  entityType: "Sole Proprietorship",
  email: "support@sticks-golf.app",
  // Display + tel: href forms of the support line.
  phone: "+1 (818) 309-5011",
  phoneHref: "+18183095011",
  // Toll-free number the SMS program sends from (Twilio TFN verification).
  // The /sms opt-in page shows this so the opt-in example matches the
  // exact program being verified.
  smsNumber: "+1 (877) 419-3998",
  // City/region shown on Contact + used for the Terms governing law.
  location: "Los Angeles, California, USA",
  governingLaw: "the State of California, USA",
  domain: "sticks-golf.app",
  url: "https://sticks-golf.app",
} as const;
