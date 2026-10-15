import { Pipe, PipeTransform } from '@angular/core';

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 28500 -> "28,500" */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return value == null ? '-' : fmt.format(value);
  }
}

/** 12 -> "0:12", 75 -> "1:15" */
@Pipe({ name: 'clock' })
export class ClockPipe implements PipeTransform {
  transform(seconds: number | null | undefined): string {
    if (seconds == null) return '-';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
