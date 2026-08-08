"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TrendingRepo } from "@/lib/trending";
import { RepoRow } from "./CardView";

export function Trending({ initial }: { initial: TrendingRepo[] }) {
  const [items, setItems] = useState(initial);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initial.length > 0);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading.current || !hasMore) return;
    loading.current = true;
    setError(null);
    try {
      const res = await fetch(`/api/trending?page=${page + 1}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      // Search results shift as stars change; drop repeats rather than
      // rendering the same repo twice on the way down.
      setItems((prev) => {
        const seen = new Set(prev.map((r) => r.repo));
        return [
          ...prev,
          ...data.items.filter((r: TrendingRepo) => !seen.has(r.repo)),
        ];
      });
      setPage((p) => p + 1);
      setHasMore(data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load more");
    } finally {
      loading.current = false;
    }
  }, [page, hasMore]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => entries[0].isIntersecting && loadMore(),
      { rootMargin: "600px" }, // start fetching before it is on screen
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore]);

  return (
    <>
      <ul>
        {items.map((r) => (
          <RepoRow key={r.repo} repo={r} />
        ))}
      </ul>

      <div ref={sentinel} className="px-4 py-8 text-center text-[13px] text-muted">
        {error ? (
          <>
            <p className="text-ink">{error}</p>
            <button
              onClick={loadMore}
              className="mt-2 cursor-pointer rounded-full border border-line px-4 py-1.5 hover:bg-surface"
            >
              Try again
            </button>
          </>
        ) : hasMore ? (
          <span>Loading more…</span>
        ) : (
          <span>
            That is everything GitHub search will serve — it stops at 1000
            results.
          </span>
        )}
      </div>
    </>
  );
}
