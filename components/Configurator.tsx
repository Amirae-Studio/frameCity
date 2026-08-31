"use client";

import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";
import { Reveal } from "./Reveal";

export function Configurator() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    description: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const contactLinks = [
    {
      name: "Email Support",
      value: "framecities@gmail.com",
      href: "mailto:framecities@gmail.com",
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
        </svg>
      ),
      action: "copy",
    },
    {
      name: "Instagram",
      value: "@amiraestudio",
      href: "https://www.instagram.com/amirae__studio/",
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      ),
      action: "link",
    },
    {
      name: "Discord",
      value: "FrameCity Community",
      href: "https://discord.com/channels/1529705981926182953",
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.893.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
      ),
      action: "link",
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.description) return;

    const subject = encodeURIComponent(`Custom City Request from ${formData.name}`);
    const body = encodeURIComponent(
      `Name: ${formData.name}\nEmail: ${formData.email}\n\nCity Request & Details:\n${formData.description}`
    );
    window.location.href = `mailto:arunkumarpearls@gmail.com?subject=${subject}&body=${body}`;

    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ name: "", email: "", description: "" });
    }, 4000);
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("framecities@gmail.com");
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  return (
    <section
      id="create"
      className="warm-radial border-t border-cream/[0.09] px-6 py-20 md:px-16 md:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
          <Reveal className="lg:col-span-6 flex flex-col justify-between space-y-6">
            <div>
              {/* <div
                className="mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-widest"
                style={{
                  color: "var(--accent)",
                  border: "1px solid rgba(var(--accent-rgb), 0.35)",
                }}
              >
                <span
                  className="h-2 w-2 rounded-full animate-pulse"
                  style={{ background: "var(--accent)" }}
                />
                Custom Requests · Amiraé Studio
              </div> */}

              <h2 className="font-display text-4xl md:text-5xl font-normal leading-[1.08] text-cream m-0">
                Can&apos;t find your city in the collection?
              </h2>
              <p className="text-sm text-cream/70 leading-relaxed mt-3 mb-0">
                We hand-model custom 1:1000 scale city districts on demand. Fill out the form below to submit your request directly to <strong className="text-cream">framecities@gmail.com</strong>.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-mono text-[11px] text-cream/60 uppercase tracking-wider mb-1">
                  Your Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Doe"
                  className="w-full rounded-xl border border-cream/20 bg-panel px-4 py-3 text-sm text-cream placeholder-cream/40 outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] text-cream/60 uppercase tracking-wider mb-1">
                  Your Email *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@example.com"
                  className="w-full rounded-xl border border-cream/20 bg-panel px-4 py-3 text-sm text-cream placeholder-cream/40 outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] text-cream/60 uppercase tracking-wider mb-1">
                  City Request &amp; Description *
                </label>
                <textarea
                  required
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe your requested city district, landmark coordinates, or frame preferences..."
                  className="w-full rounded-xl border border-cream/20 bg-panel px-4 py-3 text-sm text-cream placeholder-cream/40 outline-none focus:border-[var(--accent)] transition-colors resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 rounded-xl bg-cream text-[var(--color-base)] font-mono text-xs font-bold uppercase tracking-wider hover:scale-[1.01] transition-transform cursor-pointer border-none shadow-md"
              >
                Submit Request to Studio &rarr;
              </button>

              {submitted && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs font-mono text-emerald-400 font-bold text-center mt-2"
                >
                  ✓ Opening mail client to send request to framecities@gmail.com!
                </motion.p>
              )}
            </form>

            <div className="pt-4 border-t border-cream/10 space-y-3">
              <div className="font-mono text-[11px] text-cream/50 uppercase tracking-wider font-bold">
                Direct Contact Channels:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {contactLinks.map((item) => (
                 <div
  key={item.name}
  onClick={() => 
    item.name === 'Email Support' 
      ? (navigator.clipboard.writeText(item.href), alert('Email copied!')) 
      : window.open(item.href, '_blank')
  }
  className="flex items-center justify-between p-3 rounded-xl border border-cream/10 bg-panel/80 hover:border-cream/30 transition-all group cursor-pointer"
>

                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center border flex-shrink-0"
                        style={{
                          borderColor: "rgba(var(--accent-rgb), 0.4)",
                          background: "rgba(var(--accent-rgb), 0.1)",
                          color: "var(--accent)",
                        }}
                      >
                        {item.icon}
                      </div>
                      <div className="overflow-hidden">
                        {/* <div className="font-mono text-[9px] text-cream/50 uppercase truncate">
                          {item.value}
                        </div> */}
                        <div className="font-mono text-xs font-bold text-cream group-hover:text-[var(--accent)] transition-colors truncate">
                          {item.value}
                        </div>
                      </div>
                    </div>

                    {/* {item.action === "copy" ? (
                      <button
                        onClick={handleCopyEmail}
                        className="px-2.5 py-1 rounded-full border border-cream/20 text-[10px] font-mono text-cream/80 hover:text-cream hover:border-cream/50 transition-colors cursor-pointer bg-transparent flex-shrink-0 ml-2"
                      >
                        {copiedEmail ? "✓" : "Copy"}
                      </button>
                    ) : (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-full border border-cream/20 text-[10px] font-mono text-cream/80 hover:text-cream hover:border-cream/50 transition-colors no-underline flex-shrink-0 ml-2"
                      >
                        Visit &rarr;
                      </a>
                    )} */}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal className="lg:col-span-6 relative h-full min-h-[480px] md:min-h-[620px] w-full overflow-hidden rounded-2xl border border-cream/10 bg-black shadow-2xl">
            <Image
              src="/hero1.jpg"
              alt="FrameCity 3D Models Showcase"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover transition-transform duration-700 hover:scale-105"
              priority
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
