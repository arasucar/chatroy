import { describe, it, expect } from "vitest";
import { config } from "../middleware";

describe("middleware config", () => {
  it("protects app routes without forcing anonymous visitors through /login first", () => {
    expect(config.matcher).toContain("/dashboard/:path*");
    expect(config.matcher).toContain("/settings/:path*");
    expect(config.matcher).toContain("/admin/:path*");
    expect(config.matcher).toContain("/api/chat/:path*");
    expect(config.matcher).toContain("/api/conversations/:path*");
    expect(config.matcher).toContain("/api/auth/step-up/:path*");
    expect(config.matcher).not.toContain("/");
  });
});
