"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Upload, RefreshCw } from "lucide-react";

import {
  updateGlobalReceiptTemplate,
  uploadGlobalReceiptAsset,
} from "@/app/actions/dorm";
import { previewGlobalReceiptTemplateEmail } from "@/app/actions/finance";
import { ContributionReceiptSignatureForm } from "@/components/finance/contribution-receipt-signature-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

export function GlobalReceiptBuilder({
  dormId,
  initialSignature,
  initialSubject,
  initialMessage,
  initialLogoUrl,
}: {
  dormId: string;
  initialSignature: string;
  initialSubject: string;
  initialMessage: string;
  initialLogoUrl: string;
}) {
  const router = useRouter();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState(
    initialSubject.trim().length > 0 ? initialSubject.trim() : `Contribution payment receipt`
  );
  const [message, setMessage] = useState(initialMessage);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [signatureValue, setSignatureValue] = useState(initialSignature.trim());
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const [isRefreshingPreview, setIsRefreshingPreview] = useState(false);
  const [preview, setPreview] = useState<{
    recipient_email: string;
    subject: string;
    text: string;
    html: string;
  } | null>(null);

  const refreshPreview = async (showSuccessToast: boolean) => {
    setIsRefreshingPreview(true);
    try {
      const result = await previewGlobalReceiptTemplateEmail(dormId, {
        subject: subject.trim() || null,
        message: message.trim() || null,
        logo_url: logoUrl.trim() || null,
        signature: signatureValue || null,
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
      const result = await updateGlobalReceiptTemplate(dormId, {
        subject: subject.trim() || null,
        message: message.trim() || null,
        logo_url: logoUrl.trim() || null,
        signature: signatureValue.trim() || null,
      });

      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Global receipt template saved.");
      router.refresh();
      await refreshPreview(false);
    } catch {
      toast.error("Failed to save global receipt template.");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.set("asset_type", "logo");
      formData.set("file", file);

      const result = await uploadGlobalReceiptAsset(dormId, formData);
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

      const saveResult = await updateGlobalReceiptTemplate(dormId, {
        subject: subject.trim() || null,
        message: message.trim() || null,
        signature: signatureValue.trim() || null,
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
      toast.error("Failed to upload global logo.");
    } finally {
      setIsUploadingLogo(false);
      // Reset the file input so the same file can be re-selected
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-muted/60">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Global Receipt Template</CardTitle>
            <Badge variant="default">Default</Badge>
          </div>
          <CardDescription>
            Configure the fallback receipt template used when a specific contribution doesn't have custom receipt settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Default Subject</Label>
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Contribution payment receipt"
            />
            <p className="text-xs text-muted-foreground">The email subject line for the generated receipt.</p>
          </div>

          <div className="space-y-2">
            <Label>Default Message</Label>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              placeholder="Thank you for your contribution..."
            />
            <p className="text-xs text-muted-foreground">The opening paragraph of the email receipt.</p>
          </div>

          <Separator />

          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="space-y-2">
              <Label>Default Logo Image</Label>
              {logoUrl.trim() ? (
                <img src={logoUrl} alt="Global receipt logo" className="max-h-16 w-auto rounded border bg-white p-2" />
              ) : (
                <p className="text-xs text-muted-foreground">No global logo saved yet.</p>
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
            contributionId="GLOBAL"
            initialSignature={initialSignature}
            disabled={isSaving || isUploadingLogo}
            onChange={setSignatureValue}
          />

          <div className="flex flex-wrap gap-2 pt-4">
            <Button type="button" onClick={saveTemplate} disabled={isSaving || isUploadingLogo}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Global Template
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void refreshPreview(true)}
              disabled={isRefreshingPreview}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Preview
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted/60">
        <CardHeader>
          <CardTitle>Email Preview</CardTitle>
          <CardDescription>Generated using a dummy student and mocked contributions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">To</p>
              <p className="mt-1 text-sm font-medium">
                {preview?.recipient_email || "john.doe@example.com"}
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
                title="Global receipt email HTML preview"
                srcDoc={preview.html}
                className="h-[520px] w-full rounded border"
                style={{ minWidth: 360 }}
              />
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                Generate static preview to see rendered email.
              </div>
            )}
          </div>

          <div className="rounded-md border bg-muted/10 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Text Version</p>
            <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-xs leading-relaxed">
              {preview?.text || "Text preview appears after refresh."}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
