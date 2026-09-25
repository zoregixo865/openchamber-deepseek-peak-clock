import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

import { formatCountdown, nextSwitchAt, peakStateAt, type PeakState } from './peak.ts';

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing #root');

const style = document.createElement('style');
style.textContent = `
  .dc { display: flex; flex-direction: column; gap: 7px; color: var(--surface-foreground, var(--oc-fg, inherit)); }
  .dc-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .dc-badge { display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; padding: 1px 7px; border-radius: 9999px; font-size: 11px; font-weight: 700; letter-spacing: .04em; }
  .dc-badge[data-tone="peak"] { color: var(--error-text, var(--oc-error-text, inherit)); background: color-mix(in srgb, var(--status-error, var(--oc-error, #ef4444)) 16%, transparent); }
  .dc-badge[data-tone="off"] { color: var(--success-text, var(--oc-success-text, inherit)); background: color-mix(in srgb, var(--status-success, var(--oc-success, #10b981)) 16%, transparent); }
  .dc-dot { width: 6px; height: 6px; border-radius: 9999px; background: currentColor; }
  .dc-switch { min-width: 0; font-size: 0.8125rem; color: var(--surface-muted-foreground, var(--oc-muted, inherit)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dc-switch b { color: var(--surface-foreground, var(--oc-fg, inherit)); font-weight: 600; }
  .dc-arrow { opacity: .6; }
  .dc-reason { font-size: 0.75rem; color: var(--surface-muted-foreground, var(--oc-muted, inherit)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dc-band { position: relative; height: 14px; border-radius: 4px; background: color-mix(in srgb, var(--surface-foreground, var(--oc-fg, currentColor)) 10%, transparent); overflow: hidden; }
  .dc-seg { position: absolute; top: 0; bottom: 0; background: color-mix(in srgb, var(--status-error, var(--oc-error, #ef4444)) 52%, transparent); }
  .dc-now { position: absolute; top: -2px; bottom: -2px; width: 2px; margin-left: -1px; border-radius: 2px; background: var(--surface-foreground, var(--oc-fg, currentColor)); }
  .dc-axis { display: flex; justify-content: space-between; font-size: 10px; font-variant-numeric: tabular-nums; color: var(--surface-muted-foreground, var(--oc-muted, inherit)); opacity: .8; }
  .dc-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 10px; color: var(--surface-muted-foreground, var(--oc-muted, inherit)); white-space: nowrap; overflow: hidden; }
  .dc-tz { overflow: hidden; text-overflow: ellipsis; }
  .dc-windows { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
`;
document.head.append(style);

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const badge = el('span', 'dc-badge');
const badgeDot = el('span', 'dc-dot');
const badgeText = el('span', 'dc-badge-text');
badge.append(badgeDot, badgeText);

const switchText = el('span', 'dc-switch');
const reasonText = el('div', 'dc-reason');
const band = el('div', 'dc-band');
const nowMarker = el('div', 'dc-now');
const axis = el('div', 'dc-axis');
for (const hour of ['00', '06', '12', '18', '24']) axis.append(el('span', '', hour));
const tzText = el('span', 'dc-tz');
const windowsText = el('span', 'dc-windows');
const foot = el('div', 'dc-foot');
foot.append(tzText, windowsText);

const container = el('div', 'dc');
container.append(
  (() => {
    const head = el('div', 'dc-head');
    head.append(badge, switchText);
    return head;
  })(),
  reasonText,
  band,
  axis,
  foot,
);
band.append(nowMarker);
root.append(container);

const timeZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  } catch {
    return 'local time';
  }
})();

const clockFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

const isSameLocalDay = (a: Date, b: Date): boolean => (
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
);

const formatSwitchTime = (timestamp: number, now: Date): string => {
  const date = new Date(timestamp);
  return isSameLocalDay(date, now) ? clockFormat.format(date) : dayFormat.format(date);
};

const formatWallMinutes = (minutes: number): string => {
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return clockFormat.format(date);
};

type Segment = { start: number; end: number };

let cachedSegmentsKey = '';
let cachedSegments: Segment[] = [];

/** Peak segments for the viewer's current local day, in minutes from local midnight. */
const localDaySegments = (now: Date): Segment[] => {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const key = `${midnight.getTime()}|${timeZone}`;
  if (key === cachedSegmentsKey) return cachedSegments;
  const segments: Segment[] = [];
  let open: Segment | null = null;
  for (let minute = 0; minute < 1440; minute += 1) {
    const instant = new Date(midnight.getTime() + minute * 60_000);
    if (peakStateAt(instant).peak) {
      if (open) open.end = minute + 1;
      else {
        open = { start: minute, end: minute + 1 };
        segments.push(open);
      }
    } else {
      open = null;
    }
  }
  cachedSegmentsKey = key;
  cachedSegments = segments;
  return segments;
};

const paintSegments = (segments: Segment[]): void => {
  for (const node of band.querySelectorAll('.dc-seg')) node.remove();
  for (const segment of segments) {
    const node = el('div', 'dc-seg');
    node.style.left = `${(segment.start / 1440) * 100}%`;
    node.style.width = `${((segment.end - segment.start) / 1440) * 100}%`;
    band.insertBefore(node, nowMarker);
  }
};

const paintBadge = (state: PeakState): void => {
  badge.dataset.tone = state.peak ? 'peak' : 'off';
  badgeText.textContent = state.peak ? 'PEAK' : 'OFF-PEAK';
  badge.title = state.reason;
};

const update = (): void => {
  const now = new Date();
  const state = peakStateAt(now);
  paintBadge(state);
  reasonText.textContent = state.reason;

  const switchAt = nextSwitchAt(now);
  if (switchAt === null) {
    switchText.textContent = '';
  } else {
    switchText.replaceChildren(
      document.createTextNode(state.peak ? 'Off-peak in ' : 'Peak in '),
      Object.assign(el('b', ''), { textContent: formatCountdown(switchAt - now.getTime()) }),
      Object.assign(el('span', 'dc-arrow'), { textContent: ' → ' }),
      document.createTextNode(formatSwitchTime(switchAt, now)),
    );
  }

  const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  nowMarker.style.left = `${(minutes / 1440) * 100}%`;

  const segments = localDaySegments(now);
  paintSegments(segments);
  windowsText.textContent = segments.length > 0
    ? `Peak ${segments.map((segment) => `${formatWallMinutes(segment.start)}–${formatWallMinutes(segment.end)}`).join(', ')}`
    : '';
  tzText.textContent = timeZone;
};

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  update();
});

let reportedHeight = -1;
new ResizeObserver(() => {
  const height = Math.ceil(container.getBoundingClientRect().height) + 6;
  if (height === reportedHeight) return;
  reportedHeight = height;
  void host.setHeight(height).catch(() => undefined);
}).observe(container);

update();
setInterval(update, 1000);
