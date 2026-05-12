import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  // Amber for primary actions — warm coffee accent against the neutral shell.
  primary:
    "bg-amber-700 text-white hover:bg-amber-800 focus-visible:ring-amber-500 border border-transparent",
  // Stone outline for secondary actions.
  secondary:
    "bg-white text-stone-800 hover:bg-stone-50 border border-stone-300 focus-visible:ring-stone-400",
  // Subtle ghost for tertiary / inline actions.
  ghost:
    "bg-transparent text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent focus-visible:ring-stone-300",
  // Emerald for affirmative state changes (approve, save context).
  success:
    "bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-500 border border-transparent",
  danger:
    "bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-500 border border-transparent",
};

const SIZE: Record<Size, string> = {
  sm: "text-xs px-2.5 py-1 gap-1.5",
  md: "text-sm px-3.5 py-2 gap-2",
};

export default function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  children,
  className = "",
  ...rest
}: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
}
