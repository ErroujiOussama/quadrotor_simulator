/**
 * Experiments panel — the "robotics lab" UI. Pick a predefined experiment, run
 * it headless (in its own Simulation, separate from the live one), and read an
 * objective scorecard. Reproducible: same experiment ⇒ same score.
 */
import React, { useState } from 'react';
import { EXPERIMENTS, runExperiment, type ExperimentResult, type ExperimentSpec } from '@/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, Play, Award, AlertTriangle, Loader2 } from 'lucide-react';

const scoreColor = (s: number) =>
  s >= 80 ? 'text-emerald-400' : s >= 50 ? 'text-amber-400' : 'text-red-400';

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between text-[11px]">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-mono text-foreground">{value}</span>
  </div>
);

export const ExperimentPanel: React.FC = () => {
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const run = (spec: ExperimentSpec) => {
    setRunningId(spec.id);
    setResult(null);
    // Defer so the UI can show the running state before the (fast) sync run.
    setTimeout(() => {
      const r = runExperiment(spec);
      setResult(r);
      setRunningId(null);
    }, 20);
  };

  const sc = result?.scorecard;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FlaskConical className="h-4 w-4 text-primary" />
        Run a benchmark; get an objective, reproducible scorecard.
      </div>

      {EXPERIMENTS.map((exp) => (
        <Card key={exp.id} className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center justify-between gap-2">
              <span>{exp.name}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px] gap-1"
                disabled={runningId !== null}
                onClick={() => run(exp)}
              >
                {runningId === exp.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Run
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-muted-foreground space-y-2">
            <p>{exp.description}</p>

            {sc && result!.spec.id === exp.id && (
              <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-foreground">
                    {sc.crashed ? <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> : <Award className="h-3.5 w-3.5 text-emerald-400" />}
                    {sc.crashed ? 'Crashed' : 'Completed'}
                  </span>
                  <span className={`font-mono font-bold text-base ${scoreColor(sc.score)}`}>{sc.score.toFixed(0)}<span className="text-[10px] text-muted-foreground">/100</span></span>
                </div>
                <Metric label="Position RMSE" value={`${sc.positionRMSE.toFixed(3)} m`} />
                <Metric label="Attitude RMSE" value={`${(sc.attitudeRMSE * 180 / Math.PI).toFixed(2)}°`} />
                <Metric label="Rise time" value={sc.altitudeRiseTime != null ? `${sc.altitudeRiseTime.toFixed(2)} s` : '—'} />
                <Metric label="Settling" value={sc.altitudeSettlingTime != null ? `${sc.altitudeSettlingTime.toFixed(2)} s` : '—'} />
                <Metric label="Overshoot" value={sc.altitudeOvershoot != null ? `${sc.altitudeOvershoot.toFixed(1)}%` : '—'} />
                <Metric label="Max tilt" value={`${sc.maxTiltDeg.toFixed(1)}°`} />
                <Metric label="Energy" value={`${sc.energyWh.toFixed(2)} Wh`} />
                <Metric label="Control effort" value={sc.controlEffort.toFixed(2)} />
                <Badge variant="outline" className="text-[10px] mt-1">seed {result!.spec.seed ?? 1} · {sc.durationS}s · reproducible</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
