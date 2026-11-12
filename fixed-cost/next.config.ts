import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 모드 표시가 데스크톱 왼쪽 메뉴를 가리지 않게 오른쪽 아래로 둬요.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
