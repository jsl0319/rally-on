import { afterEach, describe, expect, it, vi } from "vitest";
import { getKakaoDirections } from "./kakao-directions";

afterEach(() => vi.unstubAllEnvs());
const place = { address_type: "REGION_ADDR", x: "127.1", y: "37.5" };
function requestWith(documents: unknown[]) {
  vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
  return vi.fn().mockResolvedValue(Response.json({ documents }));
}
describe("Kakao court directions", () => {
  it("geocodes the stored address and puts latitude before longitude in an encoded destination link", async () => {
    const request = requestWith([place]);
    const href = await getKakaoDirections("코트 / A&B", "경기 하남시 감북동 368-40", request);
    expect(href).toBe(`https://map.kakao.com/link/to/${encodeURIComponent("코트 / A&B")},37.5,127.1`);
    const url = request.mock.calls[0][0] as URL;
    expect(url.searchParams.get("query")).toBe("경기 하남시 감북동 368-40");
    expect(url.searchParams.get("analyze_type")).toBe("exact");
  });
  it.each([{ documents: [] }, { documents: [place, place] }, { documents: [{ ...place, address_type: "REGION" }] }])("refuses missing, ambiguous, or region-only locations: %j", async ({ documents }) => {
    await expect(getKakaoDirections("코트", "주소", requestWith(documents))).rejects.toMatchObject({ code: "DIRECTIONS_NOT_FOUND" });
  });
  it("does not navigate with invalid coordinates", async () => {
    await expect(getKakaoDirections("코트", "주소", requestWith([{ ...place, x: "" }]))).rejects.toMatchObject({ code: "DIRECTIONS_UNAVAILABLE" });
  });
  it("handles missing credentials without contacting Kakao", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", ""); vi.stubEnv("AUTH_KAKAO_ID", "");
    const request = vi.fn();
    await expect(getKakaoDirections("코트", "주소", request)).rejects.toMatchObject({ status: 503 });
    expect(request).not.toHaveBeenCalled();
  });
  it.each([new Response("provider error", { status: 500 }), new Response("not json")])("handles provider failures without exposing response bodies", async (response) => {
    vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
    await expect(getKakaoDirections("코트", "주소", vi.fn().mockResolvedValue(response))).rejects.toMatchObject({ code: "DIRECTIONS_UNAVAILABLE" });
  });
});
