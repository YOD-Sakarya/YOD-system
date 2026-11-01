/** Formats a number with Arabic-Indic digits. */
export const number = (value: number) => new Intl.NumberFormat('ar', { numberingSystem: 'arab' }).format(value);
/** Formats a date in Arabic (Gregorian calendar); returns a placeholder for invalid input. */
export const date = (value: string, options: Intl.DateTimeFormatOptions = {}) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'تاريخ غير متاح'
    : new Intl.DateTimeFormat('ar', {
        calendar: 'gregory',
        day: 'numeric',
        month: 'long',
        ...options,
      }).format(parsed);
};
