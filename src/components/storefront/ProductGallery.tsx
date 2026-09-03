"use client";

import { useRef, useState } from "react";

export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const shown = images.length > 0 ? images : ["/placeholder.jpg"];

  function handleScroll() {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
      >
        {shown.map((src, i) => (
          <img
            key={src + i}
            src={src}
            alt={`${alt} ${i + 1}`}
            className="w-full flex-shrink-0 snap-center"
          />
        ))}
      </div>
      {shown.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {shown.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${i === active ? "bg-brand-crimson" : "bg-brand-crimson/30"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
