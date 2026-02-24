"use client";

import { useState, useEffect } from "react";
import { Search, UserPlus, Check, Loader2 } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getOccupants } from "@/app/actions/occupants";
import { assignDormPersonnel } from "@/app/actions/dorm";
import { toast } from "sonner";

export function AssignSADialog({
  dormId,
  onAssigned
}: {
  dormId: string;
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [occupants, setOccupants] = useState<any[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadOccupants();
    }
  }, [open]);

  async function loadOccupants() {
    setLoading(true);
    try {
      const data = await getOccupants(dormId);
      // Filter for occupants who have a user_id (registered)
      setOccupants(data.filter(occ => occ.user_id));
    } catch (error) {
      toast.error("Failed to load occupants.");
    } finally {
      setLoading(false);
    }
  }

  const filteredOccupants = occupants.filter(occ =>
    occ.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    occ.student_id?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleAssign(userId: string) {
    setAssigning(userId);
    const result = await assignDormPersonnel(dormId, userId, "student_assistant");
    if (result.success) {
      toast.success("Student Assistant assigned.");
      setOpen(false);
      onAssigned();
    } else {
      toast.error(result.error || "Failed to assign SA.");
    }
    setAssigning(null);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1">
          <UserPlus className="h-3.5 w-3.5" />
          Pick SA
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assign Student Assistant</DialogTitle>
          <DialogDescription>
            Select a registered occupant to be the Student Assistant for this dorm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search occupants..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto pr-4">
            {loading ? (
              <div className="flex items-center justify-center h-full py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredOccupants.length > 0 ? (
              <div className="space-y-2">
                {filteredOccupants.map((occ) => (
                  <div
                    key={occ.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 border transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{occ.full_name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="text-sm">
                        <p className="font-medium leading-none">{occ.full_name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{occ.student_id || "No ID"}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={assigning === occ.user_id}
                      onClick={() => handleAssign(occ.user_id)}
                    >
                      {assigning === occ.user_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">No registered occupants found.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
