/**
 * GET /api/room/ABCD (WebSocket) — joins a two-player room. The relay is the `catcha-rooms` Worker (see wrangler.toml).
 */
export function onRequestGet({ request, env, params }) {
  const code = String(params.code ?? "").toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) return new Response("bad room code", { status: 400 });
  if (!env.ROOMS) return new Response("rooms not bound", { status: 503 });
  return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
}
