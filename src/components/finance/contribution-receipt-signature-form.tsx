/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

import {
  updateContributionReceiptSignature,
  uploadContributionReceiptAsset,
} from "@/app/actions/finance";
import {
  updateGlobalReceiptTemplate,
  uploadGlobalReceiptAsset,
} from "@/app/actions/dorm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function isImageValue(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image/");
}

export function ContributionReceiptSignatureForm({
  dormId,
  contributionId,
  initialSignature,
  disabled = false,
  onChange,
}: {
  dormId: string;
  contributionId: string;
  initialSignature: string;
  disabled?: boolean;
  onChange?: (newSignature: string) => void;
}) {
  const router = useRouter();
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const [signature, setSignature] = useState(initialSignature);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const signatureValue = signature.trim();
  const signatureIsImage = isImageValue(signatureValue);

  const saveSignature = async (nextValue?: string) => {
    const trimmed = (nextValue ?? signature).trim();
    if (!trimmed) {
      toast.error("Signature is required.");
      return;
    }

    setIsSaving(true);
    try {
      let result;
      if (contributionId === "GLOBAL") {
        result = await updateGlobalReceiptTemplate(dormId, {
          signature: trimmed,
        });
      } else {
        result = await updateContributionReceiptSignature(dormId, {
          contribution_id: contributionId,
          signature: trimmed,
        });
      }

      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      setSignature(trimmed);
      toast.success("Contribution receipt signature updated.");
      if (onChange) {
        onChange(trimmed);
      }
      router.refresh();
    } catch {
      toast.error("Failed to save receipt signature.");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadSignature = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("asset_type", "signature");
      formData.set("file", file);

      let uploadResult;
      if (contributionId === "GLOBAL") {
        uploadResult = await uploadGlobalReceiptAsset(dormId, formData);
      } else {
        formData.set("contribution_id", contributionId);
        uploadResult = await uploadContributionReceiptAsset(dormId, formData);
      }

      if (uploadResult && "error" in uploadResult) {
        toast.error(uploadResult.error);
        return;
      }

      if (!uploadResult || !("success" in uploadResult) || !uploadResult.success) {
        toast.error("Failed to upload signature.");
        return;
      }

      const uploadedUrl = uploadResult.asset_url;
      setSignature(uploadedUrl);
      await saveSignature(uploadedUrl);
    } catch {
      toast.error("Failed to upload signature.");
    } finally {
      setIsUploading(false);
      if (signatureInputRef.current) signatureInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Contribution Receipt Signature</Label>
        <p className="text-xs text-muted-foreground">
          Use an uploaded cursive signature image so receipts show an actual signature instead of plain text.
        </p>
      </div>

      <div className="rounded-md border bg-muted/20 p-3">
        {signatureValue ? (
          signatureIsImage ? (
            <img
              src={signatureValue}
              alt="Saved contribution signature"
              className="max-h-24 w-auto rounded border bg-white p-2"
            />
          ) : (
            <pre className="whitespace-pre-wrap rounded-md border bg-background p-3 text-xs leading-relaxed">
              {signatureValue}
            </pre>
          )
        ) : (
          <p className="text-xs text-muted-foreground">No signature set yet.</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={signatureInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadSignature(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => signatureInputRef.current?.click()}
          disabled={disabled || isUploading || isSaving}
        >
          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {isUploading ? "Uploading..." : "Upload Signature"}
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Fallback Signature Text / URL</Label>
        <Textarea
          rows={3}
          value={signature}
          onChange={(event) => setSignature(event.target.value)}
          placeholder="Signature text or image URL"
          disabled={disabled || isSaving || isUploading}
        />
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={() => void saveSignature()}
        disabled={disabled || isSaving || isUploading}
      >
        {isSaving ? "Saving..." : "Save Signature"}
      </Button>
    </div>
  );
}
