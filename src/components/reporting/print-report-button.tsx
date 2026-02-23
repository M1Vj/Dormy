"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintReportButton() {
  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={() => window.print()}
      className="print:hidden"
    >
      <Printer className="mr-2 h-4 w-4" />
      Print Report
    </Button>
  );
}
