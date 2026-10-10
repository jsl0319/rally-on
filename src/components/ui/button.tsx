"use client";

import { Button as WdsButton } from "@wanteddev/wds";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "neutral";
type ButtonSize = "small" | "medium" | "large";

type ButtonOwnProps = {
  /**
   * "primary" renders a solid brand-green button. "secondary" renders an
   * outlined brand-green button. "neutral" renders an outlined gray button,
   * for de-emphasized actions like "취소"/"돌아가기".
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
  /** Passed straight through to WDS's `Button` so an icon lays out as a
   * proper flex sibling of the label (with WDS's own gap) instead of being
   * nested inside the label's own inline wrapper, where a block-level
   * `<svg>` would otherwise break onto its own line. */
  leadingContent?: ReactNode;
  trailingContent?: ReactNode;
};

type ButtonProps<E extends ElementType = "button"> = ButtonOwnProps & {
  as?: E;
} & Omit<ComponentPropsWithoutRef<E>, keyof ButtonOwnProps | "as" | "color">;

const VARIANT_TO_WDS = {
  primary: { color: "primary", variant: "solid" },
  secondary: { color: "primary", variant: "outlined" },
  neutral: { color: "assistive", variant: "outlined" },
} as const;

/**
 * Thin wrapper around WDS's `Button` that maps this project's simpler
 * primary/secondary/neutral vocabulary onto WDS's variant/color props, and
 * keeps WDS's own polymorphic `as` support (e.g. `as={Link}` for a link
 * styled as a button).
 */
export function Button<E extends ElementType = "button">({ variant = "primary", size = "large", as, leadingContent, trailingContent, ...rest }: ButtonProps<E>) {
  const Component = WdsButton as unknown as ElementType;
  const { color, variant: wdsVariant } = VARIANT_TO_WDS[variant];
  return <Component sx={{ minHeight: size === "small" ? 44 : size === "medium" ? 48 : 52, borderRadius: 14 }} as={as} color={color} leadingContent={leadingContent} size={size} trailingContent={trailingContent} variant={wdsVariant} {...rest} />;
}
