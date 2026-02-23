"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

import { draftPaymentReceiptEmail } from "@/app/actions/email";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function ContributionReceiptBuilder({
  dormId,
  contributionId,
  contributionTitle,
  defaultAmount,
  occupants,
}: {
  dormId: string;
  contributionId: string;
  contributionTitle: string;
  defaultAmount: number;
  occupants: Array<{
    id: string;
    fullName: string;
    email: string | null;
  }>;
}) {
  const [occupantId, setOccupantId] = useState(occupants[0]?.id ?? "");
  const [subject, setSubject] = useState(`Contribution receipt: ${contributionTitle}`);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("Dormy Treasurer");
  const [logoUrl, setLogoUrl] = useState("");
  const [emailOverride, setEmailOverride] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);

  const selectedOccupant = occupants.find((occupant) => occupant.id === occupantId) ?? null;

  const handleDraft = async () => {
    if (!occupantId) {
      toast.error("Select an occupant context first.");
      return;
    }

    setIsDrafting(true);
    try {
      const result = await draftPaymentReceiptEmail({
        dorm_id: dormId,
        occupant_id: occupantId,
        category: "contributions",
        amount: defaultAmount > 0 ? defaultAmount : 1,
        note: contributionTitle,
        event_id: null,
      });

      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      if (result?.subject) setSubject(result.subject);
      if (result?.message) setMessage(result.message);
      toast.success(result?.model === "fallback" ? "Draft generated (template)." : "AI draft ready.");
    } catch {
      toast.error("Failed to generate draft.");
    } finally {
      setIsDrafting(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Receipt Editor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Occupant Context</Label>
            <Select value={occupantId} onValueChange={setOccupantId}>
              <SelectTrigger>
                <SelectValue placeholder="Select occupant" />
              </SelectTrigger>
              <SelectContent>
                {occupants.map((occupant) => (
                  <SelectItem key={occupant.id} value={occupant.id}>
                    {occupant.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Override Recipient Email (Optional)</Label>
            <Input value={emailOverride} onChange={(event) => setEmailOverride(event.target.value)} placeholder="name@example.com" />
          </div>

          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Message</Label>
              <Button type="button" size="sm" variant="outline" onClick={handleDraft} disabled={isDrafting}>
                {isDrafting ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Sparkles className="mr-2 h-3 w-3" />}
                AI Draft
              </Button>
            </div>
            <Textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={7} />
          </div>

          <div className="space-y-2">
            <Label>Signature</Label>
            <Input value={signature} onChange={(event) => setSignature(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Logo Image URL (Optional)</Label>
            <Input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://example.com/logo.png" />
          </div>

          <p className="text-xs text-muted-foreground">
            This builder prepares receipt content for the batch pay workflow and lets you validate visuals before sending.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Contribution: {contributionTitle}</Badge>
            <Badge variant="secondary">Record ID: {contributionId}</Badge>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">To</p>
            <p className="text-sm font-medium">
              {emailOverride.trim() || selectedOccupant?.email || "occupant email on file"}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Subject</p>
            <p className="text-sm font-medium">{subject || "(empty subject)"}</p>
          </div>

          <div className="rounded-md border bg-muted/20 p-4">
            {logoUrl.trim() ? (
              <div
                className="mb-3 h-12 w-40 bg-contain bg-left bg-no-repeat"
                style={{ backgroundImage: `url('${logoUrl}')` }}
                aria-label="Logo preview"
              />
            ) : null}
            <p className="mb-3 text-sm">Hi {selectedOccupant?.fullName || "Occupant"},</p>
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {message || "Your receipt message will appear here."}
            </p>
            <div className="mt-4 border-t pt-3">
              <p className="text-sm font-medium">Contribution: {contributionTitle}</p>
              <p className="text-sm">Amount context: ₱{defaultAmount.toFixed(2)}</p>
            </div>
            <p className="mt-4 text-sm">— {signature || "Dormy Treasurer"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
