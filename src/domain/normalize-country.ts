const WILDCARD = "*";

/** RN-18: mapeia codigos de pais comuns para uma forma canonica. */
const CANONICAL: Record<string, string> = {
  US: "USA",
  USA: "USA",
  UK: "GB",
  GB: "GB",
  GBR: "GB",
  UAE: "AE",
  AE: "AE"
};

export function normalizeCountryCode(country: string): string {
  const trimmed = country.trim().toUpperCase();
  if (!trimmed) {
    return WILDCARD;
  }
  return CANONICAL[trimmed] ?? trimmed;
}

export function countryCodesMatch(stored: string, playerCountry: string): boolean {
  const a = normalizeCountryCode(stored);
  const b = normalizeCountryCode(playerCountry);
  if (a === WILDCARD || b === WILDCARD) {
    return true;
  }
  return a === b;
}
