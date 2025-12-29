'use client';

export default function Marq() {
  return (
    <div className="overflow-hidden whitespace-nowrap w-full">
      <div className="inline-block animate-marquee">
        <p className="text-[#890000] inline-block">
          4chain.&nbsp;
        </p>
        {/* Duplicate content for seamless loop */}
        <p className="text-[#890000] inline-block">
          4chain.&nbsp;
        </p>
      </div>
    </div>
  );
}