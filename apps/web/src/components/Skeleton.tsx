export function Skeleton() {
  return (
    <div role="status" aria-label="Loading letters">
      <div className="skeleton-slip" aria-hidden="true" />
      <div className="skeleton-slip" aria-hidden="true" />
      <div className="skeleton-slip" aria-hidden="true" />
    </div>
  );
}
