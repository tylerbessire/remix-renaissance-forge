import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Zap, Brain } from "lucide-react";

interface ClaudeMonitorProps {
  plan: string[];
  thoughts: string;
}

export const ClaudeMonitor = ({ plan, thoughts }: ClaudeMonitorProps) => {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            DJ Claude's Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {plan.map((item, index) => (
              <li key={index} className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            DJ Claude's Live Thoughts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">{thoughts}</p>
        </CardContent>
      </Card>
    </div>
  );
};
