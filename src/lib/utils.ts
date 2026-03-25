import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AppRole } from "@/types/database";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Returns true if the role has full admin-level access */
export function isAdminRole(role: AppRole | null | undefined): boolean {
  return role === 'admin' || role === 'branch_admin' || role === 'project_manager';
}

/** Returns true only for super-admin roles (admin + project_manager) — NOT branch_admin */
export function isSuperAdminRole(role: AppRole | null | undefined): boolean {
  return role === 'admin' || role === 'project_manager';
}
