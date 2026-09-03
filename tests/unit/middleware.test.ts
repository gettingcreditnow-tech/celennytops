import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { intlMiddleware, getUser, createServerClient } = vi.hoisted(() => ({
  intlMiddleware: vi.fn(() => "intl-handled"),
  getUser: vi.fn(async () => ({ data: { user: null } })),
  createServerClient: vi.fn(),
}));

vi.mock("next-intl/middleware", () => ({ default: () => intlMiddleware }));
vi.mock("@supabase/ssr", () => {
  createServerClient.mockImplementation(() => ({ auth: { getUser } }));
  return { createServerClient };
});

import middleware from "@/middleware";

function request(path: string) {
  return new NextRequest(new URL(path, "http://localhost"));
}

beforeEach(() => {
  intlMiddleware.mockClear();
  getUser.mockClear();
});

describe("middleware", () => {
  it("refreshes the Supabase session for /admin routes without running next-intl", async () => {
    const response = await middleware(request("/admin/products"));

    expect(getUser).toHaveBeenCalledTimes(1);
    // Task 14's fix: admin paths must never be locale-redirected to /es/admin/*.
    expect(intlMiddleware).not.toHaveBeenCalled();
    expect(response).not.toBe("intl-handled");
    expect(response.headers.get("location")).toBeNull();
  });

  it("also refreshes the session on the admin login page", async () => {
    await middleware(request("/admin/login"));
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(intlMiddleware).not.toHaveBeenCalled();
  });

  it("hands storefront routes to the next-intl middleware", async () => {
    const response = await middleware(request("/catalog"));

    expect(intlMiddleware).toHaveBeenCalledTimes(1);
    expect(getUser).not.toHaveBeenCalled();
    expect(response).toBe("intl-handled");
  });
});
