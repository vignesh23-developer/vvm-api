/** True when the property category is a Layout development type (not Plot). */
export function isLayoutCategoryName(categoryName?: string | null): boolean {
  if (!categoryName) return false;
  const normalized = categoryName.toLowerCase().trim();
  // Layout-only — Plot uses standard price/size fields
  return normalized === 'layout' || normalized.includes('layout');
}
