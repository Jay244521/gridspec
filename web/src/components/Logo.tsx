export default function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={7}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
    >
      <path d="M56,24 L56,8 L8,8 L8,56 L56,56 L56,40" />
      <path d="M56,32 L38,32" />
      <rect x="31" y="25" width="14" height="14" fill="#D9761F" stroke="none" />
    </svg>
  );
}
