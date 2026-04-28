import { getDateOnlyParts, toDateOnlyString } from "@/lib/date-only";

export type LeaseBillDraft = {
  key: string;
  billType: "rent" | "security_deposit";
  description: string;
  amount: number;
  dueDate: string;
  month: number;
  year: number;
};

type BuildLeaseBillDraftsInput = {
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: number;
  securityDepositAmount?: number | null;
};

const RENT_MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const buildKey = (billType: string, dueDate: string) => `${billType}|${dueDate}`;

const firstOfMonth = (year: number, month: number) =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;

export const buildLeaseBillIdentityKey = (billType: string, dueDate: string) =>
  buildKey(String(billType || "").trim().toLowerCase(), toDateOnlyString(dueDate) || dueDate);

export function buildLeaseBillDrafts(input: BuildLeaseBillDraftsInput): LeaseBillDraft[] {
  const leaseStartDate = toDateOnlyString(input.leaseStartDate);
  const leaseEndDate = toDateOnlyString(input.leaseEndDate);
  const monthlyRent = Number(input.monthlyRent || 0);
  const securityDepositAmount = Number(input.securityDepositAmount || 0);

  const startParts = getDateOnlyParts(leaseStartDate);
  const endParts = getDateOnlyParts(leaseEndDate);
  if (!leaseStartDate || !leaseEndDate || !startParts || !endParts || monthlyRent <= 0) {
    return [];
  }

  const drafts: LeaseBillDraft[] = [];
  if (securityDepositAmount > 0) {
    drafts.push({
      key: buildKey("security_deposit", leaseStartDate),
      billType: "security_deposit",
      description: "Security Deposit",
      amount: securityDepositAmount,
      dueDate: leaseStartDate,
      month: startParts.month,
      year: startParts.year,
    });
  }

  let cursorYear = startParts.year;
  let cursorMonth = startParts.month;
  while (cursorYear < endParts.year || (cursorYear === endParts.year && cursorMonth <= endParts.month)) {
    const monthDate = new Date(Date.UTC(cursorYear, cursorMonth - 1, 1));
    const dueDate =
      cursorYear === startParts.year && cursorMonth === startParts.month && startParts.day > 1
        ? leaseStartDate
        : firstOfMonth(cursorYear, cursorMonth);

    drafts.push({
      key: buildKey("rent", dueDate),
      billType: "rent",
      description: `Rent - ${RENT_MONTH_FORMATTER.format(monthDate)}`,
      amount: monthlyRent,
      dueDate,
      month: cursorMonth,
      year: cursorYear,
    });

    cursorMonth += 1;
    if (cursorMonth > 12) {
      cursorMonth = 1;
      cursorYear += 1;
    }
  }

  return drafts;
}
