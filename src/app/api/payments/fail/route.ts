import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // Provider query strings may include sensitive details. Forward a fixed outcome only.
  return NextResponse.redirect(new URL("/settings?payment=fail", request.url));
}
