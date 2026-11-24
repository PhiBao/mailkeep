import type { ReactNode } from 'react';

export interface EmptyProps {
  title: string;
  children: ReactNode;
}

export function Empty({ title, children }: EmptyProps) {
  return (
    <section className="empty">
      <h1>{title}</h1>
      <p>{children}</p>
    </section>
  );
}
