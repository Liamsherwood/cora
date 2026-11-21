import { NextResponse, type NextRequest } from "next/server"

import { hasTicketAccess, isStaffTicketInbox } from "@/lib/tickets/access"

export function proxy(request: NextRequest) {
  const cacheControl = "private, no-store"
  if (
    isStaffTicketInbox() &&
    !hasTicketAccess(request.headers.get("authorization"))
  ) {
    return new NextResponse("Sign in to the Cora ticket inbox.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Cora tickets", charset="UTF-8"',
        "Cache-Control": cacheControl,
      },
    })
  }

  const response = NextResponse.next()
  response.headers.set("Cache-Control", cacheControl)
  return response
}

export const config = { matcher: ["/en/tickets/:path*", "/de/tickets/:path*"] }
