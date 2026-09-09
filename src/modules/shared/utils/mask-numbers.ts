export const maskNumbers = (numbers: string): string => {
  return numbers
    .split(',')
    .map((n) => (n.length > 4 ? n.slice(0, 2) + '****' + n.slice(-2) : '****'))
    .join(',');
};
