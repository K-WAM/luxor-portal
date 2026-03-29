import { runDailyPaymentReminder } from "@/lib/email/payment-reminder-runner";

export async function GET(request: Request) {
  return runDailyPaymentReminder(request);
}

export async function POST(request: Request) {
  return runDailyPaymentReminder(request);
}
