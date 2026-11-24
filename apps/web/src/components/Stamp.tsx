import { LANE_LABELS, type Lane } from '@mailkeep/shared';

export interface StampProps {
  lane: Lane;
}

export function Stamp({ lane }: StampProps) {
  return <span className={`stamp stamp--${lane}`}>{LANE_LABELS[lane]}</span>;
}
