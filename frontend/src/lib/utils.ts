import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Priority } from "./types";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return formatDate(date);
}

export const priorityConfig: Record<
  Priority,
  { label: string; colorClass: string; iconName: string }
> = {
  URGENT: { label: "Urgent", colorClass: "text-priority-urgent", iconName: "AlertTriangle" },
  HIGH:   { label: "High",   colorClass: "text-priority-high",   iconName: "ArrowUp" },
  MEDIUM: { label: "Medium", colorClass: "text-priority-medium", iconName: "Minus" },
  LOW:    { label: "Low",    colorClass: "text-priority-low",    iconName: "ArrowDown" },
  NONE:   { label: "None",   colorClass: "text-priority-none",   iconName: "MoreHorizontal" },
};
