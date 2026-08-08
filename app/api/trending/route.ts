import { trending } from "@/lib/trending";

// Infinite scroll needs pages the client can ask for, and only the server can
// reach `gh`. This is the one route that exists for that reason.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  if (!Number.isInteger(page) || page < 1) {
    return Response.json({ error: "bad page" }, { status: 400 });
  }

  try {
    return Response.json(await trending(page));
  } catch {
    // Search is rate limited at 30/min; a burst of scrolling can hit it.
    return Response.json(
      { items: [], hasMore: false, error: "GitHub search is unavailable" },
      { status: 503 },
    );
  }
}
