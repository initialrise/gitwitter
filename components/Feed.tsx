"use client";

import { useState } from "react";
import type { Bucket } from "@/lib/feed";
import { CardView, type ViewCard } from "./CardView";

type Props = {
  viewer: string;
  cards: Record<Bucket, ViewCard[]>;
  window: { from: string; to: string; events: number };
};

const TABS: { id: Bucket; label: string }[] = [
  { id: "discussed", label: "Discussed" },
  { id: "shipped", label: "Shipped" },
  { id: "discovered", label: "Discovered" },
];

export function Feed({ viewer, cards, window }: Props) {
  const [tab, setTab] = useState<Bucket>("discussed");
  const shown = cards[tab];

  return (
    <main className="mx-auto min-h-screen w-full max-w-[600px] border-x border-line">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="px-4 pt-3 pb-2">
          <h1 className="text-xl font-bold">gitwitter</h1>
          <p className="text-[13px] text-muted">
            @{viewer} · {window.events} events over {window.from}–{window.to}
          </p>
        </div>
        <nav className="flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="group flex-1 cursor-pointer px-4 py-3 text-[15px] transition-colors hover:bg-surface/60"
            >
              <span
                className={`relative inline-block pb-3 font-semibold ${
                  tab === t.id ? "text-ink" : "text-muted"
                }`}
              >
                {t.label}
                <span className="ml-1.5 text-[13px] font-normal text-muted">
                  {cards[t.id].length}
                </span>
                {tab === t.id && (
                  <span className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-brand" />
                )}
              </span>
            </button>
          ))}
        </nav>
      </header>

      {shown.length === 0 ? (
        <p className="px-4 py-16 text-center text-[15px] text-muted">
          Nothing here in the last couple of days.
        </p>
      ) : (
        <ul>
          {shown.map((c) => (
            <CardView key={c.key} card={c} />
          ))}
        </ul>
      )}

      <p className="border-t border-line px-4 py-8 text-center text-[13px] text-muted">
        GitHub only keeps ~300 events of following activity. That is the whole
        feed — there is no more to scroll.
      </p>
    </main>
  );
}
