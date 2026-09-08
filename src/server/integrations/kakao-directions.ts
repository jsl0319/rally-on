import { z } from "zod";
import { DomainError } from "@/server/domain/profile-service";

const responseSchema = z.object({
  documents: z.array(z.object({
    address_type: z.string(),
    x: z.string().trim().min(1).transform(Number).pipe(z.number().min(-180).max(180)),
    y: z.string().trim().min(1).transform(Number).pipe(z.number().min(-90).max(90)),
  })),
});

export async function getKakaoDirections(name: string, address: string, request = fetch) {
  const unavailable = () => new DomainError("DIRECTIONS_UNAVAILABLE", 503, "길찾기를 불러오지 못했어요. 다시 시도하거나 카카오맵에서 위치를 검색해 주세요.");
  const key = process.env.KAKAO_REST_API_KEY?.trim() || process.env.AUTH_KAKAO_ID?.trim();
  if (!key) throw unavailable();
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", address);
  url.searchParams.set("analyze_type", "exact");
  url.searchParams.set("size", "2");
  let body;
  try {
    const response = await request(url, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw unavailable();
    body = responseSchema.safeParse(await response.json());
  } catch { throw unavailable(); }
  if (!body.success) throw unavailable();
  const places = body.data.documents;
  if (places.length !== 1 || !["REGION_ADDR", "ROAD_ADDR"].includes(places[0].address_type)) {
    throw new DomainError("DIRECTIONS_NOT_FOUND", 422, "주소의 정확한 위치를 찾지 못했어요. 카카오맵에서 위치를 확인해 주세요.");
  }
  const { x, y } = places[0];
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${y},${x}`;
}
