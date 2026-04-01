const DIRECTIONAL_WORDS = new Set([
  "north",
  "south",
  "east",
  "west",
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
]);

const STREET_TYPE_WORDS = new Set([
  "street",
  "st",
  "avenue",
  "ave",
  "drive",
  "dr",
  "road",
  "rd",
  "boulevard",
  "blvd",
  "lane",
  "ln",
  "court",
  "ct",
  "place",
  "pl",
  "circle",
  "cir",
  "terrace",
  "ter",
  "parkway",
  "pkwy",
  "way",
]);

const normalizeAddress = (address?: string | null) => String(address || "").trim();

const extractStreetLine = (address?: string | null) =>
  normalizeAddress(address).split(",")[0]?.trim() || "";

const getFallbackLetters = (address: string) =>
  address.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 3).padEnd(3, "X");

export function getShortPropertyName(address?: string | null) {
  const streetLine = extractStreetLine(address);
  if (!streetLine) return "PROP";

  const streetNumberMatch = streetLine.match(/^(\d+)/);
  const streetDigits = (streetNumberMatch?.[1] || "").slice(0, 3);
  const remainder = streetLine.replace(/^(\d+)\s*/, "");
  const tokens = remainder.match(/[A-Za-z0-9]+/g) || [];
  const meaningfulTokens = tokens.filter((token) => {
    const normalized = token.toLowerCase();
    return !DIRECTIONAL_WORDS.has(normalized) && !STREET_TYPE_WORDS.has(normalized);
  });
  const sourceToken =
    meaningfulTokens.sort((a, b) => b.length - a.length)[0] ||
    tokens.find((token) => !DIRECTIONAL_WORDS.has(token.toLowerCase())) ||
    "";
  const letters = (sourceToken.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 3) ||
    getFallbackLetters(streetLine)).padEnd(3, "X");

  if (streetDigits) return `${letters}${streetDigits}`;
  const fallbackDigits = streetLine.replace(/\D/g, "").slice(0, 3);
  return `${letters}${fallbackDigits}` || letters;
}
