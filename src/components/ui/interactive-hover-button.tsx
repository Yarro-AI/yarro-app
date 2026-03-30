"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface InteractiveHoverButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string
  variant?: "default" | "secondary"
  size?: "sm" | "lg"
}

const InteractiveHoverButton = React.forwardRef<
  HTMLButtonElement,
  InteractiveHoverButtonProps
>(({ text = "Button", variant = "default", size = "lg", className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        "rounded-lg",
        size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm",
        variant === "secondary"
          ? "border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
        className,
      )}
      {...props}
    >
      {text}
    </button>
  )
})

InteractiveHoverButton.displayName = "InteractiveHoverButton"

export { InteractiveHoverButton }
