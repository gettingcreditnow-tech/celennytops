"use client";

import { useState } from "react";

export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const shown = images.length > 0 ? images : ["/placeholder.jpg"];
  const [index, setIndex] = useState(0);
  const hasMultiple = shown.length > 1;

  function prev() {
    setIndex((i) => (i - 1 + shown.length) % shown.length);
  }

  function next() {
    setIndex((i) => (i + 1) % shown.length);
  }

  return (
    <div>
      <div className="relative">
        <img src={shown[index]} alt={`${alt} ${index + 1}`} className="w-full" />
        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-lg text-brand-crimson shadow"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Foto siguiente"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-lg text-brand-crimson shadow"
            >
              ›
            </button>
          </>
        )}
      </div>
      {hasMultiple && (
        <div className="mt-2 flex justify-center gap-1.5">
          {shown.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${i === index ? "bg-brand-crimson" : "bg-brand-crimson/30"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
