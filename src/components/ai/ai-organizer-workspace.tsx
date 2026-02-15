"use client";

import { FormEvent, useMemo, useRef, useState, useTransition } from "react";
import { Mic, MicOff, Sparkles, Save, RefreshCcw } from "lucide-react";

import {
  getFinanceInsights,
  organizeEventConcept,
  saveEventConcept,
} from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AiConceptRecord, EventConceptDraft, FinanceInsights } from "@/lib/types/ai";

type RecognitionAlternative = {
  transcript: string;
};

type RecognitionResultLike = {
  0: RecognitionAlternative;
};

type RecognitionEventLike = {
  results: ArrayLike<RecognitionResultLike>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function linesToText(lines: string[]) {
  return lines.join("\n");
}

function textToLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function AiOrganizerWorkspace({
  events,
  recentConcepts,
  initialInsights,
}: {
  events: Array<{ id: string; title: string }>;
  recentConcepts: AiConceptRecord[];
  initialInsights: FinanceInsights | null;
}) {
  const [rawText, setRawText] = useState("");
  const [concept, setConcept] = useState<EventConceptDraft | null>(null);
  const [generatedModel, setGeneratedModel] = useState("");
  const [saveMode, setSaveMode] = useState<"draft_event" | "attach_event">("draft_event");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});
  const [insights, setInsights] = useState<FinanceInsights | null>(initialInsights);
  const [isListening, setIsListening] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isInsightsPending, startInsightsTransition] = useTransition();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const canSave = useMemo(() => {
    if (!concept) {
      return false;
    }
    if (saveMode === "attach_event" && !selectedEventId) {
      return false;
    }
    return true;
  }, [concept, saveMode, selectedEventId]);

  const toggleVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const speech =
      (window as Window & {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      }).SpeechRecognition ||
      (window as Window & {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      }).webkitSpeechRecognition;

    if (!speech) {
      setFeedback({ error: "Voice capture is not available in this browser. Use text input instead." });
      return;
    }

    const recognition = new speech();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: RecognitionEventLike) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (transcript) {
        setRawText(transcript);
      }
    };

    recognition.onerror = () => {
      setFeedback({ error: "Voice recognition encountered an error. You can continue with text input." });
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setFeedback({});
  };

  const handleOrganize = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData();
    formData.set("raw_text", rawText);
    setFeedback({});

    startTransition(async () => {
      const result = await organizeEventConcept(formData);
      if (!result || result.error || !result.concept) {
        setFeedback({ error: result?.error ?? "Failed to organize concept." });
        return;
      }

      setConcept(result.concept);
      setGeneratedModel(result.model ?? "");
      setFeedback({ success: "Concept organized. Review and edit before saving." });
    });
  };

  const handleSave = () => {
    if (!concept) {
      return;
    }

    const formData = new FormData();
    formData.set("mode", saveMode);
    formData.set("raw_text", rawText);
    formData.set("structured", JSON.stringify(concept));
    if (saveMode === "attach_event") {
      formData.set("event_id", selectedEventId);
    }

    setFeedback({});

    startTransition(async () => {
      const result = await saveEventConcept(formData);
      if (!result || result.error) {
        setFeedback({ error: result?.error ?? "Failed to save concept." });
        return;
      }

      setFeedback({ success: "Concept saved successfully." });
    });
  };

  const refreshInsights = () => {
    setFeedback({});
    startInsightsTransition(async () => {
      const result = await getFinanceInsights();
      if ("error" in result) {
        setFeedback({ error: result.error });
        return;
      }
      setInsights(result);
    });
  };

  return (
    <Tabs defaultValue="event" className="space-y-5">
      <TabsList>
        <TabsTrigger value="event">Event Concept</TabsTrigger>
        <TabsTrigger value="finance">Finance Insights</TabsTrigger>
      </TabsList>

      <TabsContent value="event" className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-amber-500" />
              AI Event Organizer
            </CardTitle>
            <CardDescription>
              Capture a raw idea by voice or text, then generate a structured event concept.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant={isListening ? "destructive" : "outline"} onClick={toggleVoice}>
                {isListening ? (
                  <>
                    <MicOff className="mr-2 size-4" />
                    Stop voice capture
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 size-4" />
                    Start voice capture
                  </>
                )}
              </Button>
              <span className="text-xs text-muted-foreground">
                Browser speech-to-text is optional. Manual text entry is always available.
              </span>
            </div>

            <form className="space-y-3" onSubmit={handleOrganize}>
              <Label htmlFor="ai_raw_text">Raw input</Label>
              <Textarea
                id="ai_raw_text"
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                placeholder="Example: Inter-level tournament, weekend schedule, expected budget, judges, and scoring criteria..."
                rows={8}
              />
              <Button type="submit" disabled={isPending || rawText.trim().length < 8}>
                <Sparkles className="mr-2 size-4" />
                {isPending ? "Organizing..." : "Organize with AI"}
              </Button>
            </form>

            {concept ? (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Review and edit output</p>
                  {generatedModel ? (
                    <p className="text-xs text-muted-foreground">Model: {generatedModel}</p>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="concept_title">Title</Label>
                    <Input
                      id="concept_title"
                      value={concept.title}
                      onChange={(event) => setConcept({ ...concept, title: event.target.value })}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="concept_goals">Goals (one per line)</Label>
                      <Textarea
                        id="concept_goals"
                        rows={5}
                        value={linesToText(concept.goals)}
                        onChange={(event) =>
                          setConcept({ ...concept, goals: textToLines(event.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="concept_timeline">Timeline (one per line)</Label>
                      <Textarea
                        id="concept_timeline"
                        rows={5}
                        value={linesToText(concept.timeline)}
                        onChange={(event) =>
                          setConcept({ ...concept, timeline: textToLines(event.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="concept_budget">Budget items</Label>
                      <Textarea
                        id="concept_budget"
                        rows={5}
                        value={linesToText(concept.budget_items)}
                        onChange={(event) =>
                          setConcept({ ...concept, budget_items: textToLines(event.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="concept_tasks">Tasks</Label>
                      <Textarea
                        id="concept_tasks"
                        rows={5}
                        value={linesToText(concept.tasks)}
                        onChange={(event) =>
                          setConcept({ ...concept, tasks: textToLines(event.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="concept_teams">Team hints</Label>
                      <Textarea
                        id="concept_teams"
                        rows={4}
                        value={linesToText(concept.team_hints)}
                        onChange={(event) =>
                          setConcept({ ...concept, team_hints: textToLines(event.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="concept_scoring">Scoring hints</Label>
                      <Textarea
                        id="concept_scoring"
                        rows={4}
                        value={linesToText(concept.scoring_hints)}
                        onChange={(event) =>
                          setConcept({ ...concept, scoring_hints: textToLines(event.target.value) })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="concept_notes">Notes</Label>
                    <Textarea
                      id="concept_notes"
                      rows={4}
                      value={concept.notes}
                      onChange={(event) => setConcept({ ...concept, notes: event.target.value })}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                    <div className="space-y-1.5">
                      <Label htmlFor="save_mode">Save mode</Label>
                      <select
                        id="save_mode"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={saveMode}
                        onChange={(event) => setSaveMode(event.target.value as "draft_event" | "attach_event")}
                      >
                        <option value="draft_event">Save as draft event</option>
                        <option value="attach_event">Attach to existing event</option>
                      </select>
                    </div>

                    {saveMode === "attach_event" ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="attach_event_id">Event</Label>
                        <select
                          id="attach_event_id"
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          value={selectedEventId}
                          onChange={(event) => setSelectedEventId(event.target.value)}
                        >
                          <option value="">Select event</option>
                          {events.map((event) => (
                            <option key={event.id} value={event.id}>
                              {event.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>

                  <Button type="button" disabled={!canSave || isPending} onClick={handleSave}>
                    <Save className="mr-2 size-4" />
                    {isPending ? "Saving..." : "Save concept"}
                  </Button>
                </div>
              </div>
            ) : null}

            {feedback.error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {feedback.error}
              </div>
            ) : null}

            {feedback.success ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                {feedback.success}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Saved Concepts</CardTitle>
            <CardDescription>Latest AI-generated concepts in this dorm.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentConcepts.map((record) => (
              <div key={record.id} className="rounded-lg border p-3">
                <p className="font-medium">{record.structured.title}</p>
                <p className="text-xs text-muted-foreground">
                  {record.event_title ? `Attached to ${record.event_title}` : "Saved as standalone concept"}
                </p>
              </div>
            ))}
            {!recentConcepts.length ? (
              <p className="text-sm text-muted-foreground">No AI concepts saved yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="finance" className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Read-only Finance Insights</CardTitle>
            <CardDescription>
              AI organizer view for fines and payments summary. This does not mutate records.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button type="button" variant="outline" onClick={refreshInsights} disabled={isInsightsPending}>
              <RefreshCcw className="mr-2 size-4" />
              {isInsightsPending ? "Refreshing..." : "Refresh insights"}
            </Button>

            {insights ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                    <p className="text-lg font-semibold">₱{insights.total_outstanding.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Occupants with balance</p>
                    <p className="text-lg font-semibold">{insights.occupants_with_balance}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Open fines</p>
                    <p className="text-lg font-semibold">{insights.open_fines}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Voided fines</p>
                    <p className="text-lg font-semibold">{insights.voided_fines}</p>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-sm font-medium">AI summary</p>
                  <p className="mt-1 text-sm text-muted-foreground">{insights.ai_summary}</p>
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-sm font-medium">Top balances</p>
                  <div className="mt-2 space-y-1">
                    {insights.top_balances.map((row) => (
                      <div key={row.occupant_id} className="flex items-center justify-between text-sm">
                        <span>{row.full_name}</span>
                        <span className="font-medium">₱{row.total_balance.toFixed(2)}</span>
                      </div>
                    ))}
                    {!insights.top_balances.length ? (
                      <p className="text-sm text-muted-foreground">No outstanding balances.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No insights yet. Click refresh to compute.</p>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
