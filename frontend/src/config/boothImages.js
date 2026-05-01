const DEFAULT_BOOTH_IMAGE = "/images/booths/%EC%A3%BC%EC%A0%90%EC%82%AC%EC%A7%84.jpg";

export function resolveBoothImageUrl(booth) {
  return booth?.imageUrl || DEFAULT_BOOTH_IMAGE;
}
