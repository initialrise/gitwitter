"use client";

import { useState } from "react";
import type { Bucket } from "@/lib/feed";
import type { TrendingRepo } from "@/lib/trending";
import { CardView, type ViewCard } from "./CardView";
import { Trending } from "./Trending";

export type Tab = Bucket | "foryou" | "trending";

type Props = {
  viewer: string;
  cards: Record<Bucket | "foryou", ViewCard[]>;
  trending: TrendingRepo[];
  window: { from: string; events: number };
};

const TABS: { id: Tab; label: string }[] = [
  { id: "foryou", label: "For you" },
  { id: "discussed", label: "Discussed" },
  { id: "shipped", label: "Shipped" },
  { id: "discovered", label: "Discovered" },
  { id: "trending", label: "Trending" },
];

export function Feed({ viewer, cards, trending, window }: Props) {
  const [tab, setTab] = useState<Tab>("foryou");

  return (
    <main className="mx-auto min-h-screen w-full max-w-[600px] border-x border-line">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="px-4 pt-3 pb-2">
          <h1 className="text-xl font-bold">gitwitter</h1>
          <p className="text-[13px] text-muted">
            @{viewer} · {window.events} events over the last {window.from}
          </p>
        </div>
        <nav className="flex overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="group flex-1 cursor-pointer px-4 py-3 text-[15px] whitespace-nowrap transition-colors hover:bg-surface/60"
            >
              <span
                className={`relative inline-block pb-3 font-semibold ${
                  tab === t.id ? "text-ink" : "text-muted"
                }`}
              >
                {t.label}
                {t.id !== "trending" && (
                  <span className="ml-1.5 text-[13px] font-normal text-muted">
                    {cards[t.id as keyof typeof cards].length}
                  </span>
                )}
                {tab === t.id && (
                  <span className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-brand" />
                )}
              </span>
            </button>
          ))}
        </nav>
      </header>

      {tab === "trending" ? (
        <Trending initial={trending} />
      ) : (
        <Bucketed cards={cards[tab]} />
      )}
    </main>
  );
}

function Bucketed({ cards }: { cards: ViewCard[] }) {
  if (cards.length === 0) {
    return (
      <p className="px-4 py-16 text-center text-[15px] text-muted">
        Nothing here in the last couple of days.
      </p>
    );
  }
  return (
    <>
      <ul>
        {cards.map((c) => (
          <CardView key={c.key} card={c} />
        ))}
      </ul>
      <p className="border-t border-line px-4 py-8 text-center text-[13px] text-muted">
        GitHub only keeps ~300 events of following activity. That is the whole
        feed — there is no more to scroll.
      </p>
    </>
  );
}
