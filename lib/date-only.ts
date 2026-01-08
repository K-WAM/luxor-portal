export type DateOnlyParts = {
  year: number;
  month: number;
  day: number;
};

export function parseDateOnly(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const [ymd] = dateStr.split("T");
  const [y, m, d] = ymd.split("-").map(Number);

  if (!Number.isFinite(y)) return null;
  const month = Number.isFinite(m) && m > 0 ? m : 1;
  const day = Number.isFinite(d) && d > 0 ? d : 1;

  return new Date(Date.UTC(y, month - 1, day));
}

export function getDateOnlyParts(dateStr?: string | null): DateOnlyParts | null {
  const date = parseDateOnly(dateStr);
  if (!date) return null;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function formatDateOnly(
  dateStr?: string | null,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const date = parseDateOnly(dateStr);
  if (!date) return "";
  return date.toLocaleDateString("en-US", { timeZone: "UTC", ...options });
}

export function formatMonthYear(dateStr?: string | null): string {
  const date = parseDateOnly(dateStr);
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatMonthYearFromParts(year: number, month: number): string {
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
