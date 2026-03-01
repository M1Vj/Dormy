/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save, Upload } from "lucide-react";

import {
  previewContributionReceiptTemplateEmail,
  updateContributionReceiptTemplate,
  updateContributionReceiptSignature,
  uploadContributionReceiptAsset,
} from "@/app/actions/finance";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ContributionReceiptSignatureForm } from "@/components/finance/contribution-receipt-signature-form";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type ReceiptPreview = {
  recipient_email: string;
  subject: string;
  text: string;
  html: string;
};

function isImageValue(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image/");
}

export function ContributionReceiptBuilder({
  dormId,
  contributionId,
  contributionTitle,
  defaultAmount,
  initialSignature,
  initialSubject,
  initialMessage,
  initialLogoUrl,
  globalTemplate,
  occupants,
}: {
  dormId: string;
  contributionId: string;
  contributionTitle: string;
  defaultAmount: number;
  initialSignature: string;
  initialSubject: string;
  initialMessage: string;
  initialLogoUrl: string;
  globalTemplate: {
    signature: string;
    subject: string;
    message: string;
    logoUrl: string;
  };
  occupants: Array<{
    id: string;
    fullName: string;
    email: string | null;
  }>;
}) {
  const router = useRouter();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [occupantId, setOccupantId] = useState(occupants[0]?.id ?? "");
  const [previewAmount, setPreviewAmount] = useState(defaultAmount > 0 ? Number(defaultAmount.toFixed(2)) : 1);
  const [previewMethod, setPreviewMethod] = useState<"cash" | "gcash" | "bank_transfer">("cash");

  const defaultSubject = initialSubject.trim() || globalTemplate.subject || "Contribution payment receipt";
  const defaultMessage = initialMessage || globalTemplate.message || "We received your payment below. Thank you.";
  const defaultLogoUrl = initialLogoUrl || globalTemplate.logoUrl;
  const defaultSignature = initialSignature.trim() || globalTemplate.signature;

  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [logoUrl, setLogoUrl] = useState(defaultLogoUrl);
  const [signatureValue, setSignatureValue] = useState(defaultSignature);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isRefreshingPreview, setIsRefreshingPreview] = useState(false);
  const [preview, setPreview] = useState<ReceiptPreview | null>(null);

  const selectedOccupant = useMemo(
    () => occupants.find((occupant) => occupant.id === occupantId) ?? null,
    [occupantId, occupants]
  );

  const signatureIsImage = isImageValue(signatureValue);

  const refreshPreview = async (showSuccessToast: boolean) => {
    if (!occupantId) {
      toast.error("Select an occupant context first.");
      return;
    }

    const normalizedAmount = Number.isFinite(previewAmount) && previewAmount > 0 ? previewAmount : 1;

    setIsRefreshingPreview(true);
    try {
      const result = await previewContributionReceiptTemplateEmail(dormId, {
        contribution_id: contributionId,
        occupant_id: occupantId,
        amount: normalizedAmount,
        method: previewMethod,
        subject: subject.trim() || null,
        message: message.trim() || null,
        logo_url: logoUrl.trim() || null,
        signature: signatureValue || null,
        paid_at_iso: new Date().toISOString(),
      });

      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      if (!result || !("success" in result) || !result.success) {
        toast.error("Failed to generate email preview.");
        return;
      }

      setPreview({
        recipient_email: result.recipient_email,
        subject: result.subject,
        text: result.text,
        html: result.html,
      });

      if (showSuccessToast) {
        toast.success("Email preview refreshed.");
      }
    } catch {
      toast.error("Failed to generate email preview.");
    } finally {
      setIsRefreshingPreview(false);
    }
  };

  const saveTemplate = async () => {
    setIsSaving(true);
    try {
      const result = await updateContributionReceiptTemplate(dormId, {
        contribution_id: contributionId,
        subject: subject.trim() || null,
        message: message.trim() || null,
        logo_url: logoUrl.trim() || null,
      });

      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Receipt template saved for this contribution.");
      router.refresh();
      await refreshPreview(false);
    } catch {
      toast.error("Failed to save receipt template.");
    } finally {
      setIsSaving(false);
    }
  };

  const resetToGlobal = async () => {
    setIsSaving(true);
    try {
      await updateContributionReceiptTemplate(dormId, {
        contribution_id: contributionId,
        subject: null,
        message: null,
        logo_url: null,
      });

      // Clear the custom signature as well
      await updateContributionReceiptSignature(dormId, {
        contribution_id: contributionId,
        signature: "", // Empty string to signify clearing the local override
      });

      setSubject(globalTemplate.subject || "Contribution payment receipt");
      setMessage(globalTemplate.message || "We received your payment below. Thank you.");
      setLogoUrl(globalTemplate.logoUrl);
      setSignatureValue(globalTemplate.signature);

      toast.success("Reverted to global default template.");
      router.refresh();
      await refreshPreview(false);
    } catch {
      toast.error("Failed to reset template.");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.set("contribution_id", contributionId);
      formData.set("asset_type", "logo");
      formData.set("file", file);

      const result = await uploadContributionReceiptAsset(dormId, formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      if (!result || !("success" in result) || !result.success) {
        toast.error("Failed to upload logo.");
        return;
      }

      const nextLogoUrl = result.asset_url;
      setLogoUrl(nextLogoUrl);

      const saveResult = await updateContributionReceiptTemplate(dormId, {
        contribution_id: contributionId,
        subject: subject.trim() || null,
        message: message.trim() || null,
        logo_url: nextLogoUrl,
      });

      if (saveResult && "error" in saveResult) {
        toast.error(saveResult.error);
        return;
      }

      toast.success("Logo uploaded and saved.");
      router.refresh();
      await refreshPreview(false);
    } catch {
      toast.error("Failed to upload logo.");
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-muted/60">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Receipt Editor</CardTitle>
              <Badge variant="secondary">Saved per contribution</Badge>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isSaving || isUploadingLogo || isRefreshingPreview}>
                  Reset to Global Default
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset to Global Default?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to revert to the global default template? This will clear custom settings for this contribution.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => {
                    // Slight delay to allow dialog to close before freezing main thread with state updates
                    setTimeout(() => void resetToGlobal(), 50);
                  }}>
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure the contribution receipt template once. Payment dialogs will reuse this template automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Occupant Context</Label>
              <Select
                value={occupantId}
                onValueChange={(value) => {
                  setOccupantId(value);
                  setPreview(null);
                }}
              >
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
              <Label>Preview Amount (₱)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={previewAmount}
                onChange={(event) => setPreviewAmount(parseFloat(event.target.value) || 0)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preview Payment Method</Label>
            <Select value={previewMethod} onValueChange={(value) => setPreviewMethod(value as "cash" | "gcash" | "bank_transfer")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="gcash">GCash</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Contribution payment receipt"
            />
          </div>

          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={7}
              placeholder="Thank you for your contribution..."
            />
          </div>

          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="space-y-2">
              <Label>Logo Image</Label>
              {logoUrl.trim() ? (
                <img src={logoUrl} alt="Receipt logo" className="max-h-16 w-auto rounded border bg-white p-2" />
              ) : (
                <p className="text-xs text-muted-foreground">No logo saved yet.</p>
              )}
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadLogo(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => logoInputRef.current?.click()}
              disabled={isUploadingLogo}
            >
              {isUploadingLogo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {isUploadingLogo ? "Uploading..." : "Upload Logo"}
            </Button>
          </div>

          <ContributionReceiptSignatureForm
            dormId={dormId}
            contributionId={contributionId}
            initialSignature={initialSignature}
            disabled={isSaving || isUploadingLogo}
            onChange={setSignatureValue}
          />

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={saveTemplate} disabled={isSaving || isUploadingLogo}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Template
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void refreshPreview(true)}
              disabled={isRefreshingPreview || !occupantId}
            >
              {isRefreshingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh Preview
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted/60">
        <CardHeader>
          <CardTitle>Email Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">To</p>
              <p className="mt-1 text-sm font-medium">
                {preview?.recipient_email || selectedOccupant?.email || "occupant email on file"}
              </p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Subject</p>
              <p className="mt-1 text-sm font-medium">{preview?.subject || subject || "(empty subject)"}</p>
            </div>
          </div>

          <div className="rounded-md border bg-background p-2">
            {preview?.html ? (
              <iframe
                title="Contribution receipt email HTML preview"
                srcDoc={preview.html}
                className="h-[520px] w-full rounded border"
              />
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                Generate preview to see rendered email.
              </div>
            )}
          </div>

          <div className="rounded-md border bg-muted/10 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Text Version</p>
            <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-xs leading-relaxed">
              {preview?.text || "Text preview appears after refresh."}
            </pre>
          </div>

          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
            Contribution: {contributionTitle}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
