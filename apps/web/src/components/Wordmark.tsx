export function Wordmark() {
  return (
    <span className="wordmark">
      <svg className="wordmark__mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect
          x="3"
          y="7"
          width="26"
          height="19"
          rx="1.5"
          fill="#FFFDF8"
          stroke="#1E2430"
          strokeWidth="2.5"
        />
        <polyline points="3,8 16,18 29,8" fill="none" stroke="#1E2430" strokeWidth="2.5" />
        <circle cx="26" cy="8" r="4.5" fill="#B3401F" stroke="#F6F1E7" strokeWidth="1.5" />
      </svg>
      <span>Mailkeep</span>
    </span>
  );
}
