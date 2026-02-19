"use client";

import { useState, useEffect } from "react";
import { Share2, Copy, Check, ExternalLink, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createPublicViewToken,
  getEntityPublicTokens,
  togglePublicViewToken,
} from "@/app/actions/finance";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface PublicShareDialogProps {
  dormId: string;
  entityId: string;
  entityType: "event" | "finance_ledger";
  title: string;
}

export function PublicShareDialog({
  dormId,
  entityId,
  entityType,
  title,
}: PublicShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokens, setTokens] = useState<any[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchTokens = async () => {
    const data = await getEntityPublicTokens(dormId, entityId);
    setTokens(data);
  };

  useEffect(() => {
    if (open) {
      fetchTokens();
    }
  }, [open, dormId, entityId]);

  const handleCreateToken = async () => {
    setLoading(true);
    try {
      const result = await createPublicViewToken(dormId, entityType, entityId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Public share link generated!");
        fetchTokens();
      }
    } catch (error) {
      toast.error("Failed to generate link.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (tokenId: string, current: boolean) => {
    const result = await togglePublicViewToken(dormId, tokenId, !current);
    if (result.error) {
      toast.error(result.error);
    } else {
      fetchTokens();
    }
  };

  const copyToClipboard = (token: string) => {
    const url = `${window.location.origin}/p/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="h-4 w-4" />
          Share Summary
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Contribution Summary</DialogTitle>
          <DialogDescription>
            Generate a secure, public link to share collection progress for <strong>{title}</strong>.
            Dormers' names are hidden for privacy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          <div className="flex flex-col gap-4">
            <Button
              onClick={handleCreateToken}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
              {tokens.length > 0 ? "Generate New Link" : "Generate Shareable Link"}
            </Button>
          </div>

          {tokens.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-900">Active Links</h4>
              <div className="space-y-3">
                {tokens.map((token) => (
                  <div
                    key={token.id}
                    className="group border rounded-xl p-3 bg-slate-50/50 hover:bg-white transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={token.is_active ? "default" : "secondary"} className="text-[10px] h-5 px-1.5 uppercase font-bold tracking-wider">
                          {token.is_active ? "Active" : "Disabled"}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-medium">
                          Created {format(new Date(token.created_at), "MMM d, yyyy")}
                        </span>
                      </div>
                      <Switch
                        checked={token.is_active}
                        onCheckedChange={() => handleToggle(token.id, token.is_active)}
                        className="scale-75 origin-right"
                      />
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          readOnly
                          value={`${typeof window !== 'undefined' ? window.location.origin : ''}/p/${token.token}`}
                          className="h-9 pr-10 text-xs font-mono bg-white truncate"
                        />
                        <button
                          onClick={() => copyToClipboard(token.token)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                          {copied === token.token ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-slate-400 hover:text-indigo-600" asChild>
                        <a href={`/p/${token.token}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-indigo-900 uppercase tracking-wider">Privacy Guaranteed</p>
              <p className="text-[11px] text-indigo-800/80 leading-relaxed font-medium">
                Public links only show the total amount collected and number of participants.
                Dormer names, room numbers, and individual payment details are never shared.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
