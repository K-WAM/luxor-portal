"use client";

export default function ContactPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-xl border border-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Contact Us</h1>
        <p className="text-slate-600 mb-4">
          We&apos;re here to help. Reach out anytime.
        </p>
        <div className="space-y-2 text-slate-800">
          <div>
            <span className="font-medium">Email:</span>{" "}
            <a href="mailto:connect@luxordev.com" className="text-blue-600 hover:text-blue-700">
              connect@luxordev.com
            </a>
          </div>
          <div>
            <span className="font-medium">Website:</span>{" "}
            <a href="https://luxordev.com" className="text-blue-600 hover:text-blue-700" target="_blank" rel="noreferrer">
              luxordev.com
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
