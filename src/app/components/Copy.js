'use client';

import Image from 'next/image';

export default function AddressDisplay({ contractAddress, className = "" }) {
  // The base URL for pump.fun token pages
  const pumpLink = `https://pump.fun/`;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <a 
        href={pumpLink} 
        target="_blank" 
        rel="noopener noreferrer"
        className="transition-opacity hover:opacity-80"
      >
        <img 
          src="/pump.png" 
          alt="View on Pump.fun" 
          className="w-4 h-4 object-contain" 
        />
      </a>
    </div>
  );
}