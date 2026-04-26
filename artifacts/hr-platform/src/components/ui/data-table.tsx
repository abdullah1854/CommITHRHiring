import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface DataTableProps extends TableHTMLAttributes<HTMLTableElement> {
  minWidthClassName?: string;
  wrapperClassName?: string;
}

export function DataTable({ className, minWidthClassName = "min-w-[900px]", wrapperClassName, ...props }: DataTableProps) {
  return (
    <div className={cn("overflow-x-auto", wrapperClassName)}>
      <table className={cn("w-full border-collapse text-left", minWidthClassName, className)} {...props} />
    </div>
  );
}

export function DataTableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-border bg-muted text-sm text-muted-foreground", className)} {...props} />;
}

export function DataTableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-border [&>tr:nth-child(even)]:bg-muted/40", className)} {...props} />;
}

export function DataTableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-muted", className)} {...props} />;
}

export function DataTableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("p-4 font-semibold", className)} {...props} />;
}

export function DataTableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("p-4", className)} {...props} />;
}
