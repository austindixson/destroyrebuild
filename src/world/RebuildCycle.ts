import { FORM_FRAMING, FORM_NAMES } from './forms';

const DURATION = 14;
const smooth = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** Hold → break → suspended fragments → assemble a new form → hold. */
export class RebuildCycle {
  private elapsed = 0;
  private form = 0;

  advance(delta: number): void {
    const elapsed = this.elapsed + delta;
    this.form = (this.form + Math.floor(elapsed / DURATION)) % FORM_NAMES.length;
    this.elapsed = elapsed % DURATION;
  }

  fracture(paused: boolean): void {
    if (paused) {
      this.form = this.elapsed >= 10.5 ? (this.target + 1) % FORM_NAMES.length : this.target;
      this.elapsed = 0;
      return;
    }
    if (this.elapsed >= 10.5) this.advance(DURATION - this.elapsed);
    if (this.elapsed < 3) this.elapsed = 3;
  }

  get source(): number { return this.form; }
  get target(): number { return (this.form + 1) % FORM_NAMES.length; }
  get blend(): number { return smooth((this.elapsed - 5) / 4.5); }
  get framing(): number {
    return FORM_FRAMING[this.source] + (FORM_FRAMING[this.target] - FORM_FRAMING[this.source]) * this.blend;
  }
  get spread(): number {
    return smooth((this.elapsed - 3) / 2.5) * (1 - smooth((this.elapsed - 6.5) / 4));
  }
  get label(): string {
    if (this.elapsed < 3 || this.elapsed >= 10.5) return 'FORM / ASSEMBLED';
    if (this.elapsed < 6.5) return 'DECONSTRUCTING';
    return 'REBUILDING';
  }
  get specimen(): string {
    if (this.elapsed < 3) return FORM_NAMES[this.source];
    if (this.elapsed >= 10.5) return FORM_NAMES[this.target];
    return `${FORM_NAMES[this.source]} → ${FORM_NAMES[this.target]}`;
  }
}
