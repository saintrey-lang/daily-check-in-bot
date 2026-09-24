// Vercel Authentication restricts access to the entire deployed project.
// Keep a same-origin check on mutations to prevent other sites from submitting them.
export function requireSameOrigin(request: Request): Response | null {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  return null;
}
