"use client";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-4xl bg-white/90 backdrop-blur shadow-xl border border-slate-200 rounded-2xl overflow-hidden">
        <div className="grid md:grid-cols-2 gap-0">
          <div className="p-10 space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-blue-600 font-semibold mb-2">Get in touch</p>
              <h1 className="text-3xl font-semibold text-slate-900">We’re here to help</h1>
              <p className="text-slate-600 mt-3">
                Questions about your portal, billing, or property performance? Reach out and our Luxor team will respond promptly.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-sm font-semibold">01</span>
                <div>
                  <div className="text-sm text-slate-500">Email</div>
                  <a
                    href="mailto:connect@luxordev.com"
                    className="text-lg font-medium text-slate-900 hover:text-blue-700"
                  >
                    connect@luxordev.com
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-sm font-semibold">02</span>
                <div>
                  <div className="text-sm text-slate-500">Website</div>
                  <a
                    href="https://luxordev.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-lg font-medium text-slate-900 hover:text-blue-700"
                  >
                    luxordev.com
                  </a>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href="mailto:connect@luxordev.com"
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold shadow hover:bg-blue-700 transition"
              >
                Email Luxor Support
              </a>
              <a
                href="https://luxordev.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm font-semibold hover:border-slate-400 transition"
              >
                Visit luxordev.com
              </a>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-500 text-white p-10 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="text-sm uppercase tracking-[0.2em] text-blue-100 font-semibold">Our promise</div>
              <h2 className="text-2xl font-semibold leading-tight">Clear communication. Reliable support.</h2>
              <p className="text-blue-50 leading-relaxed">
                Whether you’re an owner, tenant, or admin, we keep your portal secure and responsive. Reach out anytime and we’ll follow up quickly.
              </p>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
              <div className="bg-white/10 rounded-lg p-4">
                <div className="text-blue-100 text-xs uppercase tracking-wide">Response time</div>
                <div className="text-lg font-semibold">Under 1 business day</div>
              </div>
              <div className="bg-white/10 rounded-lg p-4">
                <div className="text-blue-100 text-xs uppercase tracking-wide">Support hours</div>
                <div className="text-lg font-semibold">Mon–Fri, 9a–6p ET</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
