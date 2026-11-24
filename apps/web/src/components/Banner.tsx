import type { ReactNode } from 'react';

export interface BannerProps {
  children: ReactNode;
  tone?: 'note' | 'warning';
}

export function Banner({ children, tone = 'note' }: BannerProps) {
  return (
    <div className={`banner banner--${tone}`} role="status">
      {children}
    </div>
  );
}
