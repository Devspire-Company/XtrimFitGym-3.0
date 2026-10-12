import type { ReportData } from './api';

export type ReportDownloadScope = 'demand' | 'revenue' | 'visits' | 'memberships' | 'all';

type PdfInput = {
  scope: ReportDownloadScope;
  data: ReportData;
  address: string;
  logoUrl?: string;
};

const PAGE_WIDTH = 1700;
const PAGE_HEIGHT = 2800;
const GOLD = '#b99d3e';
const GOLD_LIGHT = '#e1c966';
const TEAL = '#4f9f94';
const INK = '#17191d';
const MUTED = '#69717a';
const LINE = '#d9dde1';
const SOFT = '#f4f5f3';

const money = (amount: number) => `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (date: string) => new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short' });

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius = 24) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function fillRounded(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string, radius = 24) {
  roundedRect(context, x, y, width, height, radius);
  context.fillStyle = color;
  context.fill();
}

function strokeRounded(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color = LINE, radius = 24) {
  roundedRect(context, x, y, width, height, radius);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.stroke();
}

function text(context: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, weight = 400, color = INK, align: CanvasTextAlign = 'left') {
  context.font = `${weight} ${size}px Arial, sans-serif`;
  context.fillStyle = color;
  context.textAlign = align;
  context.textBaseline = 'alphabetic';
  context.fillText(value, x, y);
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function createPage(title: string, subtitle: string, input: PdfInput, logo: HTMLImageElement | null) {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PDF canvas could not be created.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  context.fillStyle = '#fafaf8';
  context.fillRect(0, 0, PAGE_WIDTH, 310);
  context.fillStyle = GOLD;
  context.fillRect(0, 0, 18, PAGE_HEIGHT);
  if (logo) context.drawImage(logo, 95, 62, 205, 92);
  text(context, 'X-TRIM FIT GYM', 330, 102, 34, 800);
  text(context, input.address, 330, 143, 22, 400, MUTED);
  text(context, 'OFFICIAL ADMINISTRATIVE REPORT', 95, 226, 17, 700, GOLD);
  text(context, title, 95, 278, 45, 800);
  text(context, subtitle, 1605, 233, 21, 400, MUTED, 'right');
  text(context, `${dateLabel(input.data.period.from)} - ${dateLabel(input.data.period.to)}`, 1605, 274, 26, 700, INK, 'right');
  context.fillStyle = GOLD;
  context.fillRect(95, 309, 1510, 5);
  return { canvas, context };
}

function footer(context: CanvasRenderingContext2D, page: number, total: number) {
  context.strokeStyle = LINE;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(95, 2705);
  context.lineTo(1605, 2705);
  context.stroke();
  text(context, 'X-TRIM FIT GYM  |  Verified administrative records', 95, 2752, 18, 400, MUTED);
  text(context, `Page ${page} of ${total}`, 1605, 2752, 18, 700, MUTED, 'right');
}

function sectionTitle(context: CanvasRenderingContext2D, eyebrow: string, titleValue: string, y: number) {
  text(context, eyebrow.toUpperCase(), 95, y, 17, 700, GOLD);
  text(context, titleValue, 95, y + 48, 35, 800);
}

function metric(context: CanvasRenderingContext2D, x: number, y: number, width: number, label: string, value: string, note: string) {
  fillRounded(context, x, y, width, 170, SOFT, 22);
  strokeRounded(context, x, y, width, 170, '#e1e3e4', 22);
  context.fillStyle = GOLD;
  context.fillRect(x, y, 7, 170);
  text(context, label.toUpperCase(), x + 30, y + 41, 16, 700, MUTED);
  text(context, value, x + 30, y + 99, 34, 800);
  text(context, note, x + 30, y + 139, 17, 400, MUTED);
}

function drawSummary(context: CanvasRenderingContext2D, data: ReportData, y: number) {
  const gap = 18;
  const width = (1510 - gap * 3) / 4;
  const average = data.summary.transactions ? data.summary.revenue / data.summary.transactions : 0;
  metric(context, 95, y, width, 'Cash collected', money(data.summary.revenue), `${data.summary.transactions} payments | ${money(average)} average`);
  metric(context, 95 + width + gap, y, width, 'Member attendance', data.summary.attendance.toLocaleString(), 'Verified check-in records');
  metric(context, 95 + (width + gap) * 2, y, width, 'Walk-in visits', data.summary.walkIns.toLocaleString(), 'Recorded counter visits');
  metric(context, 95 + (width + gap) * 3, y, width, 'New members', data.summary.newMembers.toLocaleString(), `${data.summary.activeMemberships} active memberships`);
}

function drawLineChart(context: CanvasRenderingContext2D, rows: ReportData['monthlyActivity'], x: number, y: number, width: number, height: number) {
  fillRounded(context, x, y, width, height, '#ffffff', 24);
  strokeRounded(context, x, y, width, height, LINE, 24);
  text(context, 'MONTHLY MOMENTUM', x + 34, y + 47, 17, 700, MUTED);
  text(context, 'Memberships and walk-ins', x + 34, y + 91, 29, 800);
  const left = x + 70; const right = x + width - 35; const top = y + 145; const bottom = y + height - 70;
  const max = Math.max(1, ...rows.flatMap((row) => [row.memberships, row.walkIns]));
  for (let tick = 0; tick <= 4; tick += 1) {
    const yy = bottom - ((bottom - top) * tick / 4);
    context.strokeStyle = '#e6e8e9'; context.lineWidth = 2; context.setLineDash([8, 9]);
    context.beginPath(); context.moveTo(left, yy); context.lineTo(right, yy); context.stroke(); context.setLineDash([]);
    text(context, String(Math.round(max * tick / 4)), left - 20, yy + 6, 15, 400, MUTED, 'right');
  }
  const points = (key: 'memberships' | 'walkIns') => rows.map((row, index) => ({
    x: left + (rows.length > 1 ? index * (right - left) / (rows.length - 1) : (right - left) / 2),
    y: bottom - row[key] * (bottom - top) / max,
    value: row[key],
  }));
  const plot = (values: ReturnType<typeof points>, color: string) => {
    if (!values.length) return;
    context.strokeStyle = color; context.lineWidth = 7; context.lineJoin = 'round'; context.lineCap = 'round';
    context.beginPath(); values.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke();
    values.forEach((point) => { context.fillStyle = '#fff'; context.beginPath(); context.arc(point.x, point.y, 9, 0, Math.PI * 2); context.fill(); context.strokeStyle = color; context.lineWidth = 5; context.stroke(); });
  };
  plot(points('memberships'), GOLD); plot(points('walkIns'), TEAL);
  rows.forEach((row, index) => {
    const xx = left + (rows.length > 1 ? index * (right - left) / (rows.length - 1) : (right - left) / 2);
    text(context, monthLabel(row.month), xx, bottom + 38, 15, 500, MUTED, 'center');
  });
  const legendX = x + width - 360;
  context.fillStyle = GOLD; context.fillRect(legendX, y + 47, 34, 7); text(context, 'Memberships', legendX + 47, y + 57, 16, 600, MUTED);
  context.fillStyle = TEAL; context.fillRect(legendX + 185, y + 47, 34, 7); text(context, 'Walk-ins', legendX + 232, y + 57, 16, 600, MUTED);
}

function drawDemandSnapshot(context: CanvasRenderingContext2D, rows: ReportData['monthlyActivity'], x: number, y: number, width: number, height: number) {
  fillRounded(context, x, y, width, height, SOFT, 24); strokeRounded(context, x, y, width, height, LINE, 24);
  const memberships = rows.reduce((sum, row) => sum + row.memberships, 0);
  const walkIns = rows.reduce((sum, row) => sum + row.walkIns, 0);
  const total = memberships + walkIns;
  text(context, 'DEMAND SNAPSHOT', x + 34, y + 48, 17, 700, GOLD);
  text(context, `${total.toLocaleString()} total activities`, x + 34, y + 94, 29, 800);
  const cx = x + width / 2; const cy = y + 260; const radius = 105;
  context.strokeStyle = '#dfe3e2'; context.lineWidth = 35; context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.stroke();
  if (total) { context.strokeStyle = GOLD; context.beginPath(); context.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * memberships / total); context.stroke(); }
  text(context, `${total ? Math.round(memberships / total * 100) : 0}%`, cx, cy + 8, 42, 800, INK, 'center');
  text(context, 'MEMBERSHIPS', cx, cy + 42, 14, 700, MUTED, 'center');
  const rowsY = y + 430;
  [['Memberships', memberships, GOLD], ['Walk-ins', walkIns, TEAL]].forEach(([label, value, color], index) => {
    const yy = rowsY + index * 70; context.fillStyle = String(color); context.beginPath(); context.arc(x + 40, yy, 8, 0, Math.PI * 2); context.fill();
    text(context, String(label), x + 62, yy + 7, 19, 600, MUTED); text(context, Number(value).toLocaleString(), x + width - 35, yy + 7, 23, 800, INK, 'right');
  });
  context.strokeStyle = LINE; context.beginPath(); context.moveTo(x + 34, y + 590); context.lineTo(x + width - 34, y + 590); context.stroke();
  text(context, 'BUSIEST MONTHS', x + 34, y + 638, 17, 700, MUTED);
  const top = [...rows].sort((a, b) => (b.memberships + b.walkIns) - (a.memberships + a.walkIns)).slice(0, 4);
  top.forEach((row, index) => { const yy = y + 696 + index * 68; text(context, `${index + 1}`, x + 35, yy, 18, 700, MUTED); text(context, new Date(`${row.month}-01T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }), x + 75, yy, 18, 600); text(context, String(row.memberships + row.walkIns), x + width - 35, yy, 20, 800, INK, 'right'); });
}

function demandPage(input: PdfInput, logo: HTMLImageElement | null) {
  const { canvas, context } = createPage('Memberships and walk-ins', '12-month demand intelligence', input, logo);
  drawSummary(context, input.data, 375);
  sectionTitle(context, 'Activity intelligence', 'Membership and walk-in demand', 625);
  drawLineChart(context, input.data.monthlyActivity, 95, 720, 1035, 1120);
  drawDemandSnapshot(context, input.data.monthlyActivity, 1155, 720, 450, 1120);
  const total = input.data.monthlyActivity.reduce((sum, row) => sum + row.memberships + row.walkIns, 0);
  fillRounded(context, 95, 1880, 1510, 530, '#fafaf8', 24); strokeRounded(context, 95, 1880, 1510, 530, LINE, 24);
  text(context, 'REPORT NOTES', 130, 1935, 17, 700, GOLD);
  text(context, 'Demand interpretation', 130, 1990, 31, 800);
  text(context, total ? 'The chart compares membership starts and walk-in visits across the latest twelve calendar months.' : 'No membership or walk-in activity was recorded in the twelve-month reporting window.', 130, 2050, 20, 400, MUTED);
  text(context, 'All values come from verified X-TRIM transaction and visit records.', 130, 2090, 20, 400, MUTED);
  footer(context, 1, 1);
  return canvas;
}

function revenuePage(input: PdfInput, logo: HTMLImageElement | null) {
  const { canvas, context } = createPage('Revenue performance', 'Cash activity and collection sources', input, logo);
  const { data } = input; const average = data.summary.transactions ? data.summary.revenue / data.summary.transactions : 0;
  metric(context, 95, 375, 480, 'Total revenue', money(data.summary.revenue), `${data.summary.transactions} verified payments`);
  metric(context, 592, 375, 480, 'Average transaction', money(average), 'Across completed payments');
  metric(context, 1089, 375, 516, 'Reporting days', data.period.days.toLocaleString(), `${dateLabel(data.period.from)} to ${dateLabel(data.period.to)}`);
  sectionTitle(context, 'Cash performance', 'Revenue trend', 625);
  fillRounded(context, 95, 720, 1510, 930, '#fff', 24); strokeRounded(context, 95, 720, 1510, 930, LINE, 24);
  const chart = data.daily.length > 60 ? data.daily.filter((_row, index) => index % Math.ceil(data.daily.length / 55) === 0 || index === data.daily.length - 1) : data.daily;
  const max = Math.max(1, ...chart.map((row) => row.revenue)); const chartTop = 835; const chartBottom = 1535; const chartLeft = 165; const chartRight = 1540;
  for (let tick = 0; tick <= 4; tick += 1) { const yy = chartBottom - (chartBottom - chartTop) * tick / 4; context.strokeStyle = '#e6e8e9'; context.setLineDash([8, 9]); context.beginPath(); context.moveTo(chartLeft, yy); context.lineTo(chartRight, yy); context.stroke(); context.setLineDash([]); text(context, money(max * tick / 4), chartLeft - 18, yy + 6, 14, 400, MUTED, 'right'); }
  const barGap = Math.max(3, (chartRight - chartLeft) / Math.max(chart.length, 1) * .25); const barWidth = Math.max(7, (chartRight - chartLeft) / Math.max(chart.length, 1) - barGap);
  chart.forEach((row, index) => { const xx = chartLeft + index * (chartRight - chartLeft) / Math.max(chart.length, 1) + barGap / 2; const height = row.revenue / max * (chartBottom - chartTop); context.fillStyle = row.revenue ? GOLD : '#e5e7e8'; context.fillRect(xx, chartBottom - Math.max(height, 3), barWidth, Math.max(height, 3)); });
  sectionTitle(context, 'Revenue mix', 'Collection sources', 1740);
  const maximum = Math.max(1, ...data.revenueBreakdown.map((row) => row.amount));
  data.revenueBreakdown.forEach((row, index) => { const yy = 1840 + index * 170; fillRounded(context, 95, yy, 1510, 135, SOFT, 20); text(context, row.type.replaceAll('_', ' '), 130, yy + 48, 18, 700, MUTED); text(context, money(row.amount), 1570, yy + 51, 24, 800, INK, 'right'); text(context, `${row.count} ${row.count === 1 ? 'payment' : 'payments'}`, 130, yy + 87, 17, 400, MUTED); context.fillStyle = '#dedfdf'; context.fillRect(500, yy + 65, 820, 12); context.fillStyle = GOLD; context.fillRect(500, yy + 65, 820 * row.amount / maximum, 12); });
  footer(context, 1, 1); return canvas;
}

function visitsPage(input: PdfInput, logo: HTMLImageElement | null) {
  const { canvas, context } = createPage('Visits and attendance', 'Verified daily gym traffic', input, logo);
  metric(context, 95, 375, 480, 'Member attendance', input.data.summary.attendance.toLocaleString(), 'Verified member check-ins');
  metric(context, 592, 375, 480, 'Walk-in visits', input.data.summary.walkIns.toLocaleString(), 'Counter visits in this period');
  metric(context, 1089, 375, 516, 'Combined visits', (input.data.summary.attendance + input.data.summary.walkIns).toLocaleString(), `${input.data.period.days} reporting days`);
  sectionTitle(context, 'Gym traffic', 'Daily visit activity', 625);
  const rows = input.data.daily.slice(-20).reverse(); const max = Math.max(1, ...rows.map((row) => row.attendance + row.walkIns));
  fillRounded(context, 95, 720, 1510, 1710, '#fff', 24); strokeRounded(context, 95, 720, 1510, 1710, LINE, 24);
  text(context, 'DATE', 130, 780, 16, 700, MUTED); text(context, 'VISIT MIX', 470, 780, 16, 700, MUTED); text(context, 'MEMBERS', 1375, 780, 16, 700, MUTED, 'right'); text(context, 'WALK-INS', 1558, 780, 16, 700, MUTED, 'right');
  rows.forEach((row, index) => { const yy = 835 + index * 74; if (index % 2 === 0) fillRounded(context, 115, yy - 38, 1470, 62, '#f8f8f6', 10); text(context, dateLabel(row.date), 130, yy, 18, 600); context.fillStyle = '#e4e6e7'; context.fillRect(470, yy - 12, 720, 20); context.fillStyle = GOLD; context.fillRect(470, yy - 12, 720 * row.attendance / max, 20); context.fillStyle = TEAL; context.fillRect(470 + 720 * row.attendance / max, yy - 12, 720 * row.walkIns / max, 20); text(context, row.attendance.toLocaleString(), 1375, yy, 19, 700, INK, 'right'); text(context, row.walkIns.toLocaleString(), 1558, yy, 19, 700, INK, 'right'); });
  footer(context, 1, 1); return canvas;
}

function membershipsPage(input: PdfInput, logo: HTMLImageElement | null) {
  const { canvas, context } = createPage('Membership health', 'Portfolio status and plan performance', input, logo);
  const statuses = input.data.membershipStatus;
  const total = Object.values(statuses).reduce((sum, value) => sum + value, 0);
  metric(context, 95, 375, 480, 'Total records', total.toLocaleString(), 'All membership statuses');
  metric(context, 592, 375, 480, 'Active', statuses.active.toLocaleString(), 'Currently active memberships');
  metric(context, 1089, 375, 516, 'New in period', input.data.summary.newMembers.toLocaleString(), 'New member profiles');
  sectionTitle(context, 'Current portfolio', 'Membership status', 625);
  const statusData = [['Active', statuses.active, '#58a98d'], ['Paused', statuses.paused, GOLD], ['Expired', statuses.expired, '#8c969f'], ['Cancelled', statuses.cancelled, '#ad7777']] as const;
  statusData.forEach(([label, value, color], index) => { const xx = 95 + index * 384; fillRounded(context, xx, 720, 360, 260, SOFT, 24); context.fillStyle = color; context.beginPath(); context.arc(xx + 54, 772, 11, 0, Math.PI * 2); context.fill(); text(context, label.toUpperCase(), xx + 79, 780, 17, 700, MUTED); text(context, value.toLocaleString(), xx + 35, 884, 57, 800); text(context, total ? `${Math.round(value / total * 100)}% of all records` : 'No membership records', xx + 35, 932, 17, 400, MUTED); });
  sectionTitle(context, 'Plan performance', 'Plans started in this period', 1090);
  fillRounded(context, 95, 1185, 1510, 1160, '#fff', 24); strokeRounded(context, 95, 1185, 1510, 1160, LINE, 24);
  text(context, 'RANK', 130, 1250, 16, 700, MUTED); text(context, 'MEMBERSHIP PLAN', 270, 1250, 16, 700, MUTED); text(context, 'STARTED', 1300, 1250, 16, 700, MUTED, 'right'); text(context, 'VALUE', 1560, 1250, 16, 700, MUTED, 'right');
  if (!input.data.topPlans.length) text(context, 'No memberships started during this reporting period.', 130, 1340, 21, 500, MUTED);
  input.data.topPlans.slice(0, 10).forEach((plan, index) => { const yy = 1335 + index * 92; if (index % 2 === 0) fillRounded(context, 115, yy - 52, 1470, 75, '#f8f8f6', 10); text(context, String(index + 1), 150, yy, 21, 800, GOLD); text(context, plan.name, 270, yy, 21, 700); text(context, plan.count.toLocaleString(), 1300, yy, 21, 700, INK, 'right'); text(context, money(plan.value), 1560, yy, 21, 800, INK, 'right'); });
  footer(context, 1, 1); return canvas;
}

export async function downloadReportPdf(input: PdfInput) {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), input.logoUrl ? loadImage(input.logoUrl) : Promise.resolve(null)]);
  const creators = input.scope === 'all'
    ? [demandPage, revenuePage, visitsPage, membershipsPage]
    : [input.scope === 'demand' ? demandPage : input.scope === 'revenue' ? revenuePage : input.scope === 'visits' ? visitsPage : membershipsPage];
  const pages = creators.map((create) => create(input, logo));
  if (pages.length > 1) pages.forEach((page, index) => {
    const context = page.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(30, 2670, PAGE_WIDTH - 30, 130);
    footer(context, index + 1, pages.length);
  });
  const documentPdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215.9, 355.6], compress: true });
  pages.forEach((page, index) => {
    if (index) documentPdf.addPage([215.9, 355.6], 'portrait');
    documentPdf.addImage(page.toDataURL('image/jpeg', .94), 'JPEG', 0, 0, 215.9, 355.6, undefined, 'FAST');
  });
  const names: Record<ReportDownloadScope, string> = { demand: 'Memberships-and-Walk-ins', revenue: 'Revenue-Performance', visits: 'Visits-and-Attendance', memberships: 'Membership-Health', all: 'Complete-Reports-and-Analytics' };
  documentPdf.save(`X-TRIM-${names[input.scope]}-${input.data.period.from}-to-${input.data.period.to}.pdf`);
}
