"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CompetitionPrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer className="mr-2 size-4" />
      Print
    </Button>
  );
}
