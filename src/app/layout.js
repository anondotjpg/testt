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
      <Marquee speed={100}>
        <p className="text-[#890000]">
          4bonk is a 4chan inspired platform for <a href="https://bonk.fun" className='inline text-blue-600 underline'>bonk.fun</a> and crypto culture. We aim to be the hub for major discourse of all crypto topics. Since we are heavily inspired by 4chan many of the same features the internet has loved for decades are available. For example the legendary greentext with &gt; and reply to post with &gt;&gt;. 4bonk was built by a dedicated team with a passion for crypto and the extreme culture that comes with it. We are a small team of traders, developers, and overall crypto-natives. We built 4bonk because we believe there {`isn't`} anything like this for the general crypto culture.&nbsp;
        </p>
      </Marquee>
      <BodyWrapper>{children}</BodyWrapper>
    </html>
  )
}