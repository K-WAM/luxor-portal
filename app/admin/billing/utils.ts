export const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-700";
    case "overdue":
      return "bg-red-100 text-red-700";
    case "voided":
      return "bg-gray-100 text-gray-600";
    case "pending":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-amber-100 text-amber-800";
  }
};

export const isValidUrl = (value: string) => {
  if (!value) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};
