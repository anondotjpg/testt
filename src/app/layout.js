import "./globals.css"
import BodyWrapper from './components/BodyWrapper'
import Marquee from "react-fast-marquee"

export const metadata = {
  title: "4bonk",
  description: "forum of the trenches",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <BodyWrapper>{children}</BodyWrapper>
    </html>
  )
}