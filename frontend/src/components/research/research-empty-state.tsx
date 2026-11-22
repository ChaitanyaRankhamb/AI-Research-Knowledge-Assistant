"use client";

import * as React from "react";

export function ResearchEmptyState() {
  return (
    <div className="mb-6 flex flex-col items-center text-center select-none">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground max-w-xl">
        What research would you like to explore?
      </h1>
    </div>
  );
}
