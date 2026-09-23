import "./globals.css";

export const metadata = {
  title: "딜레마 교실",
  description: "학급 전체가 실시간으로 짝을 지어 협력과 배신을 선택하는 죄수의 딜레마 교실 게임",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link
          href="https://fonts.googleapis.com/css2?family=Song+Myung&family=Gothic+A1:wght@400;500;700;900&family=JetBrains+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
