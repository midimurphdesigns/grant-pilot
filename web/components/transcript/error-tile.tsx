import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ErrorTile({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="size-4" />
      <AlertTitle>Stream error</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
