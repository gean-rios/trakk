"use client";

import React from "react";
import { cn } from "@/lib/utils";

function Tooltip({
  content,
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  content: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
      {...props}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded-panel border border-trakk-border bg-trakk-surface px-2 py-1 font-body text-xs text-trakk-text shadow-card"
        >
          {content}
        </span>
      )}
    </span>
  );
}

export { Tooltip };