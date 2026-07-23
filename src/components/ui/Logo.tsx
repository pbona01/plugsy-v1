import React from 'react';

interface LogoProps {
  className?: string;
}

export function Logo({ className = "w-full h-full object-contain" }: LogoProps) {
  return (
    <>
      <img src="https://i.postimg.cc/4dHFwnzr/IMG-1987.png" alt="Plugsy Logo" className={`hidden dark:block rounded-full ${className}`} />
      <img src="https://i.postimg.cc/qvBbS1sw/IMG-1986.png" alt="Plugsy Logo" className={`block dark:hidden rounded-full ${className}`} />
    </>
  );
}
