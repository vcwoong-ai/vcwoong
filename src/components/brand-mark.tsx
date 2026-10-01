import type { SVGProps } from "react";

/** D-shaped lens: connected evidence converges on a clear point of view. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" {...props}>
      <path d="M10 7h9a13 13 0 0 1 0 26h-9V7Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="m11 11 13 9-13 9M11 20h13" stroke="currentColor" strokeWidth="1.5" opacity=".55" />
      <circle cx="24" cy="20" r="4" fill="currentColor" />
      <circle cx="10" cy="11" r="2.5" fill="currentColor" />
      <circle cx="10" cy="29" r="2.5" fill="currentColor" />
    </svg>
  );
}
