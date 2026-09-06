import Link from "next/link";

/**
 * The one account, named once.
 *
 * A handle written out in each place it appears is a handle that eventually disagrees with itself —
 * and on a protocol site the account link is exactly the string a phisher would love to see drift.
 * Everything that points at us reads it from here, including the card metadata.
 */
export const X_HANDLE = "ClubyTech";
export const X_URL = `https://x.com/${X_HANDLE}`;

/** The X mark, as a path rather than an image: it is two triangles and it should stay crisp at 16px. */
export function XGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * `rel="noopener noreferrer"` on every one of these, not as a habit but because `target="_blank"`
 * hands the opened page a handle back to ours without it.
 */
export function XLink({ className = "", label = false }: { className?: string; label?: boolean }) {
  return (
    <Link
      href={X_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Cluby on X, @${X_HANDLE}`}
      className={className}
    >
      <XGlyph className="h-[15px] w-[15px]" />
      {label && <span>@{X_HANDLE}</span>}
    </Link>
  );
}
