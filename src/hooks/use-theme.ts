/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useThemeChoice } from '@/branding/ThemeChoice';

export function useTheme() {
  const { scheme } = useThemeChoice();
  return Colors[scheme];
}
