"use client";

import { Reveal } from "./Reveal";
import { Accordion, AccordionItem } from "./ui/Accordion";

interface FAQItem {
  id: number;
  question: string;
  answer: string;
}

const FAQ_DATA: FAQItem[] = [
  {
    id: 1,
    question: "Is FrameCity a physical product?",
    answer:
      "No. FrameCity provides digital 3D-printable model files (.STL / .3MF) that you can custom generate, download, and print yourself or through a local printing service.",
  },
  {
    id: 2,
    question: "Do I need a 3D printer to use FrameCity?",
    answer:
      "Yes, or access to one. You get print-ready digital files optimized for FDM and Resin 3D printers. You can also upload your generated files to services like MakerWorld, PCBWay, or local print shops to get them printed.",
  },
  {
    id: 5,
    question: "What file formats will I receive after downloading?",
    answer:
      "You receive production-ready .3MF and .STL files, complete with pre-configured color layer splits for multi-color 3D printing (such as Bambu Lab AMS setups).",
  },
  {
    id: 6,
    question: "Can I scale or resize the model to fit my own physical frame?",
    answer:
      "Yes. The exported files are structured with standard aspect ratios (e.g., 1:1, 4:5, 16:9). You can scale the models in your slicer (Bambu Studio, PrusaSlicer, Cura) to match your physical frame dimensions.",
  },
  {
    id: 7,
    question: "Is FrameCity affiliated with MakerWorld?",
    answer:
      "FrameCity is designed with the MakerWorld community in mind. While we host our customization engine here, our official campaigns, 3D print presets, and community profile are hosted directly on MakerWorld.",
  },
];

export function FAQ() {
  const accordionItems: AccordionItem[] = FAQ_DATA.map((item) => ({
    id: item.id,
    title: item.question,
    content: item.answer,
  }));

  return (
    <section
      id="faq"
      className="border-t border-cream/[0.09] px-4 py-16 md:px-12 md:py-24"
    >
      <div className="mx-auto max-w-4xl">
        {/* Section Header */}
        <Reveal className="mb-12 text-center md:mb-16">
          <h2 className="font-display text-3xl font-normal text-cream md:text-5xl">
            Frequently Asked Questions
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-cream/60 md:text-base">
            Everything you need to know about custom generating, downloading, and 3D printing your FrameCity models.
          </p>
        </Reveal>

        {/* Accordion Component */}
        <Reveal>
          <Accordion items={accordionItems} />
        </Reveal>
      </div>
    </section>
  );
}