"use client";

import Image from "next/image";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-4xl bg-white/90 backdrop-blur shadow-xl border border-slate-200 rounded-2xl overflow-hidden">
        <div className="grid md:grid-cols-2 gap-0">
          {/* Left: contact details */}
          <div className="p-10 space-y-8">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-blue-600 font-semibold mb-2">Contact us</p>
              <h1 className="text-3xl font-semibold text-slate-900">We’re here to help</h1>
              <p className="text-slate-500 mt-3 leading-relaxed">
                Questions about your portal, billing, or property performance? Our team responds promptly.
              </p>
            </div>

            <div className="space-y-5">
              <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/60">
                <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-medium mb-0.5">Email</div>
                  <a href="mailto:connect@luxordev.com" className="text-sm font-semibold text-slate-900 hover:text-blue-700 transition-colors">
                    connect@luxordev.com
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/60">
                <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-medium mb-0.5">Website</div>
                  <a href="https://luxordev.com" target="_blank" rel="noreferrer" className="text-sm font-semibold text-slate-900 hover:text-blue-700 transition-colors">
                    luxordev.com
                  </a>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href="mailto:connect@luxordev.com"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email Support
              </a>
              <a
                href="https://luxordev.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition"
              >
                Visit Website
              </a>
            </div>
          </div>

          {/* Right: brand panel */}
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-slate-900 text-white p-10 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-8">
                <Image src="/luxor-logo.svg" alt="Luxor" width={48} height={48} className="opacity-95 flex-shrink-0" />
                <span className="text-xl font-bold tracking-wide">Luxor</span>
              </div>
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold leading-tight">Clear communication.<br />Reliable support.</h2>
                <p className="text-slate-300 leading-relaxed text-sm">
                  Whether you’re an owner, tenant, or admin — we keep your portal secure and responsive. Reach out anytime and we’ll follow up quickly.
                </p>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
              <div className="bg-white/8 rounded-xl p-4 border border-white/10">
                <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Response time</div>
                <div className="font-semibold">Under 1 business day</div>
              </div>
              <div className="bg-white/8 rounded-xl p-4 border border-white/10">
                <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Support hours</div>
                <div className="font-semibold">Mon–Fri, 9a–6p ET</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
