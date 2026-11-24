import { nanoid } from 'nanoid';

export function id(prefix: 'ltr' | 'case' | 'ask' | 'hh' | 'mem'): string {
  return `${prefix}_${nanoid()}`;
}
