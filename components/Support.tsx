"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Reveal } from "./Reveal";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Default Constant Fallback Values
export const DEFAULT_CAMPAIGN = {
  title: "FrameCity: High detailed cities in frames",
  description:
    "Hand-modelled city districts, engineered for a perfect print — pick your place, print your frame.",
  creator_name: "Amiraé Studio",
  creator_tag: "First Created",
  fund_raised: 15692,
  goal_amount: 1000,
  backers: 158,
  days_to_go: 10,
  makerworld_url:
    "https://makerworld.com/en/crowdfunding/313-framecity-high-detailed-cities-in-frames",
  end_date_utc: "2026/09/09 18:20:36 UTC",
};

export function Support() {
  // const [copied, setCopied] = useState(false);
  // const [isFollowing, setIsFollowing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [campaign, setCampaign] = useState(DEFAULT_CAMPAIGN);

  useEffect(() => {
    async function fetchCampaignStats() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("campaign_stats")
          .select("*")
          .eq("slug", "framecity-main")
          .single();

        if (data && !error) {
          setCampaign({
            title: data.title || DEFAULT_CAMPAIGN.title,
            description: data.description || DEFAULT_CAMPAIGN.description,
            creator_name: data.creator_name || DEFAULT_CAMPAIGN.creator_name,
            creator_tag: data.creator_tag || DEFAULT_CAMPAIGN.creator_tag,
            fund_raised: Number(data.fund_raised) || DEFAULT_CAMPAIGN.fund_raised,
            goal_amount: Number(data.goal_amount) || DEFAULT_CAMPAIGN.goal_amount,
            backers: Number(data.backers) || DEFAULT_CAMPAIGN.backers,
            days_to_go: Number(data.days_to_go) || DEFAULT_CAMPAIGN.days_to_go,
            makerworld_url: data.makerworld_url || DEFAULT_CAMPAIGN.makerworld_url,
            end_date_utc: data.end_date_utc || DEFAULT_CAMPAIGN.end_date_utc,
          });
        }
      } catch {
        // Fall back gracefully to DEFAULT_CAMPAIGN if query fails or table not yet created
      }
    }

    fetchCampaignStats();
  }, []);

  // const handleCopyLink = () => {
  //   navigator.clipboard.writeText(campaign.makerworld_url);
  //   setCopied(true);
  //   setTimeout(() => setCopied(false), 2000);
  // };

  const percentFunded = Math.min(
    100,
    Math.round((campaign.fund_raised / (campaign.goal_amount || 1)) * 100)
  );

  return (
    <section
      id="support"
      className="border-t border-cream/[0.09] px-4 py-16 md:px-12 md:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-10 text-center md:mb-14">
          {/* <div
            className="mb-3 inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-widest"
            style={{
              color: "var(--accent)",
              border: "1px solid rgba(var(--accent-rgb), 0.35)",
            }}
          >
            <span
              className="h-2 w-2 rounded-full animate-pulse"
              style={{ background: "var(--accent)" }}
            />
            Live Campaign on MakerWorld
          </div> */}
          <h2 className="font-display text-3xl md:text-5xl font-normal text-cream">
            Support FrameCity Crowdfunding
          </h2>
        </Reveal>

        {/* MakerWorld Campaign Card - Theme-Aware Light/Dark Mode */}
        <Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch rounded-2xl border border-cream/10 bg-panel p-6 md:p-8 shadow-2xl overflow-hidden text-cream">
            {/* Left Side: Campaign Media (Image or Video) */}
            <div className="lg:col-span-6 relative flex flex-col justify-center overflow-hidden rounded-xl bg-black group min-h-[340px] md:min-h-[460px]">
              {isPlaying ? (
                <video
                  src="/Framecity_video.mp4"
                  autoPlay
                  controls
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <>
                  <Image
                    src="/frame.jpeg"
                    alt="FrameCity Paris Model in Frame"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

                  {/* Play button overlay icon */}
                  <button
                    onClick={() => setIsPlaying(true)}
                    aria-label="Play FrameCity video"
                    className="absolute inset-0 flex items-center justify-center group/play cursor-pointer border-none bg-transparent"
                  >
                    <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-xl transition-all duration-300 group-hover/play:scale-110 group-hover/play:bg-[#22c55e] group-hover/play:border-emerald-400">
                      <svg className="w-7 h-7 fill-current translate-x-0.5" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </button>

                  {/* Video control bottom bar preview */}
                  <div
                    onClick={() => setIsPlaying(true)}
                    className="absolute bottom-3 left-4 right-4 flex items-center justify-between font-mono text-xs text-white/80 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10 cursor-pointer hover:bg-black/60 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      0:00 / 0:30
                    </span>
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                    </svg>
                  </div>
                </>
              )}
            </div>

            {/* Right Side: Campaign Details & Backing Actions */}
            <div className="lg:col-span-6 flex flex-col justify-between py-2">
              <div>
                {/* Title & Description */}
                <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-cream mb-2 leading-snug">
                  {campaign.title}
                </h3>
                <p className="text-sm  text-cream-400 mb-6 leading-relaxed">
                  {campaign.description}
                </p>

                {/* Creator Avatar & Name */}
                <div className="flex items-center gap-3 mb-6 pb-5 border-b border-cream/10">
                  <div className="w-10 h-10 rounded-full bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-center overflow-hidden relative flex-shrink-0">
                    <Image
                      src="/amirae.webp"
                      alt={`${campaign.creator_name} Logo`}
                      width={40}
                      height={40}
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-cream">{campaign.creator_name}</div>
                    <div className="text-xs text-cream/60">{campaign.creator_tag}</div>
                  </div>
                </div>

                {/* Amount Raised & Stats */}
                <div className="mb-4">
                  <div className="text-3xl md:text-4xl font-extrabold text-[#22c55e] tracking-tight mb-1">
                    USD {campaign.fund_raised.toLocaleString()}
                  </div>
                  <div className="flex justify-between items-center text-sm text-cream/70 font-medium">
                    <span>pledged of USD {campaign.goal_amount.toLocaleString()} goal</span>
                    <span className="text-cream font-bold">{campaign.backers.toLocaleString()} backers</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="h-2.5 w-full bg-cream/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${percentFunded}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                      className="h-full bg-[#22c55e] rounded-full shadow-[0_0_12px_rgba(34,197,94,0.6)]"
                    />
                  </div>
                  <div className="mt-2 text-sm font-bold text-cream">
                    {campaign.days_to_go} <span className="font-normal text-cream/60">days to go</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons & Links */}
              <div className="space-y-4 pt-4 border-t border-cream/10">
                {/* Back this project button -> Redirects to MakerWorld */}
                <a
                  href={campaign.makerworld_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center py-4 px-6 rounded-xl text-base font-semibold bg-[#22c55e] hover:bg-[#16a34a] text-white transition-all duration-300 border border-emerald-500/30 shadow-md group cursor-pointer no-underline"
                >
                  <span className="group-hover:scale-105 transition-transform duration-200 flex items-center gap-2">
                    Back this project on MakerWorld
                    <svg className="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </span>
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}


