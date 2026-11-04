import { env } from "@/lib/env";
import { widgetSource } from "./widget-source";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(widgetSource(env.appUrl), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
