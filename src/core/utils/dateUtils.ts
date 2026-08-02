type SupportedLocale = 'ar-SA' | 'en-US';

const toDate = (input: string | Date): Date => {
  if (input instanceof Date) return input;
  const d = new Date(input);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${input}`);
  return d;
};

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

const DEFAULT_DATETIME_OPTIONS: Intl.DateTimeFormatOptions = {
  ...DEFAULT_DATE_OPTIONS,
  hour: 'numeric',
  minute: '2-digit',
};

export function formatDate(date: string | Date, locale: SupportedLocale = 'ar-SA'): string {
  return toDate(date).toLocaleDateString(locale, DEFAULT_DATE_OPTIONS);
}

export function formatDateTime(date: string | Date, locale: SupportedLocale = 'ar-SA'): string {
  return toDate(date).toLocaleDateString(locale, DEFAULT_DATETIME_OPTIONS);
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_MONTH = 2_592_000_000;
const MS_PER_YEAR = 31_536_000_000;

interface RelativeUnit {
  threshold: number;
  singular: Record<SupportedLocale, string>;
  plural: Record<SupportedLocale, string>;
}

const RELATIVE_UNITS: RelativeUnit[] = [
  { threshold: MS_PER_YEAR, singular: { 'ar-SA': 'سنة', 'en-US': 'year' }, plural: { 'ar-SA': 'سنوات', 'en-US': 'years' } },
  { threshold: MS_PER_MONTH, singular: { 'ar-SA': 'شهر', 'en-US': 'month' }, plural: { 'ar-SA': 'أشهر', 'en-US': 'months' } },
  { threshold: MS_PER_DAY, singular: { 'ar-SA': 'يوم', 'en-US': 'day' }, plural: { 'ar-SA': 'أيام', 'en-US': 'days' } },
  { threshold: MS_PER_HOUR, singular: { 'ar-SA': 'ساعة', 'en-US': 'hour' }, plural: { 'ar-SA': 'ساعات', 'en-US': 'hours' } },
  { threshold: MS_PER_MINUTE, singular: { 'ar-SA': 'دقيقة', 'en-US': 'minute' }, plural: { 'ar-SA': 'دقائق', 'en-US': 'minutes' } },
];

const arabicDigits = (n: number): string => {
  const digits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(n).replace(/\d/g, (d) => digits[Number(d)]);
};

export function formatRelative(date: string | Date, locale: SupportedLocale = 'ar-SA'): string {
  const target = toDate(date);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  const absDiff = Math.abs(diff);
  const isPast = diff <= 0;
  const isArabic = locale === 'ar-SA';

  for (const unit of RELATIVE_UNITS) {
    const count = Math.floor(absDiff / unit.threshold);
    if (count >= 1) {
      const label = count === 1 ? unit.singular[locale] : unit.plural[locale];
      const countStr = isArabic ? arabicDigits(count) : String(count);
      if (isArabic) {
        return isPast ? `منذ ${countStr} ${label}` : `بعد ${countStr} ${label}`;
      }
      const unitLabel = `${countStr} ${label}${count !== 1 ? '' : ''}`;
      return isPast ? `${unitLabel} ago` : `in ${unitLabel}`;
    }
  }

  return isArabic ? 'الآن' : 'just now';
}

export function toISODate(date: string | Date): string {
  const d = toDate(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getDateRange(period: 'today' | 'week' | 'month' | 'year'): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);

  switch (period) {
    case 'today':
      break;
    case 'week':
      from.setDate(now.getDate() - 7);
      break;
    case 'month':
      from.setMonth(now.getMonth() - 1);
      break;
    case 'year':
      from.setFullYear(now.getFullYear() - 1);
      break;
  }

  return { from: toISODate(from), to: toISODate(now) };
}

const ARABIC_NUMERALS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

const ARABIC_MONTH_NAMES: Record<string, number> = {
  'يناير': 0,
  'فبراير': 1,
  'مارس': 2,
  'أبريل': 3, 'ابريل': 3,
  'مايو': 4,
  'يونيو': 5,
  'يوليو': 6,
  'أغسطس': 7, 'اغسطس': 7,
  'سبتمبر': 8,
  'أكتوبر': 9, 'اكتوبر': 9,
  'نوفمبر': 10,
  'ديسمبر': 11,
};

const ARABIC_MONTHS_ORDERED = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'ابريل',
  'مايو', 'يونيو', 'يوليو', 'أغسطس', 'اغسطس', 'سبتمبر', 'أكتوبر',
  'اكتوبر', 'نوفمبر', 'ديسمبر',
];

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const normalizeArabicNumerals = (str: string): string =>
  str.replace(/[٠-٩]/g, (ch) => ARABIC_NUMERALS[ch] || ch);

const matchArabicMonth = (normalized: string): number | null => {
  const lower = normalized.toLowerCase();
  for (const name of ARABIC_MONTHS_ORDERED) {
    if (lower.includes(name)) return ARABIC_MONTH_NAMES[name];
  }
  return null;
};

const matchEnglishMonth = (lower: string): number | null => {
  for (const [name, idx] of Object.entries(MONTH_NAME_TO_INDEX)) {
    if (lower.includes(name)) return idx;
  }
  return null;
};

export function parseFlexibleDate(input: string): Date | null {
  if (!input || !input.trim()) return null;
  const trimmed = input.trim();

  const isoParsed = new Date(trimmed);
  if (!isNaN(isoParsed.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return isoParsed;
  }

  const normalized = normalizeArabicNumerals(trimmed);
  const lower = normalized.toLowerCase();

  // Arabic month names e.g. "15 يناير 2024" or "يناير 15 2024"
  const arMonthIndex = matchArabicMonth(lower);
  if (arMonthIndex !== null) {
    const dayMatch = normalized.match(/(\d{1,2})/g);
    const yearMatch = normalized.match(/(\d{4})/);
    if (dayMatch && yearMatch) {
      const day = Number(dayMatch[0]);
      const year = Number(yearMatch[0]);
      return new Date(year, arMonthIndex, day);
    }
  }

  // English month names e.g. "Jan 15 2024" or "15 Jan 2024"
  const enMonthIndex = matchEnglishMonth(lower);
  if (enMonthIndex !== null) {
    const dayMatch = normalized.match(/\b(\d{1,2})\b/g);
    const yearMatch = normalized.match(/(\d{4})/);
    if (dayMatch && yearMatch) {
      const day = Number(dayMatch[0]);
      const year = Number(yearMatch[0]);
      return new Date(year, enMonthIndex, day);
    }
  }

  // Slash/dash/dot separated: YYYY/MM/DD, DD/MM/YYYY, MM/DD/YYYY
  const sepPattern = /^(\d{1,4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,4})$/;
  const sepMatch = normalized.match(sepPattern);
  if (sepMatch) {
    let a = Number(sepMatch[1]);
    let b = Number(sepMatch[2]);
    let c = Number(sepMatch[3]);
    if (a > 31 && a <= 9999 && c <= 31) {
      // a is year
      return new Date(a, b - 1, c);
    }
    if (c > 31 && c <= 9999 && a <= 31) {
      // c is year
      return new Date(c, b - 1, a);
    }
    return new Date(a, b - 1, c);
  }

  // DMY with space: "15 08 2024"
  const spacePattern = /^(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/;
  const spaceMatch = normalized.match(spacePattern);
  if (spaceMatch) {
    const d = Number(spaceMatch[1]);
    const m = Number(spaceMatch[2]);
    const y = Number(spaceMatch[3]);
    if (m <= 12) return new Date(y, m - 1, d);
    return new Date(y, d - 1, m);
  }

  return null;
}
