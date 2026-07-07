import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet } from "lucide-react";
import { SavedItemsManager } from "@/components/SavedItemsManager";

export const Route = createFileRoute("/_authenticated/sheets")({
  component: SheetsPage,
  head: () => ({ meta: [{ title: "Sheets" }, { name: "description", content: "Save and organise your spreadsheets with names and notes." }] }),
});

function SheetsPage() {
  return (
    <SavedItemsManager
      table="saved_sheets"
      title="Sheets"
      description="Store spreadsheet URLs (Google Sheets, Excel Online, etc.) with a name and notes."
      icon={FileSpreadsheet}
      urlPlaceholder="https://docs.google.com/spreadsheets/d/..."
    />
  );
}