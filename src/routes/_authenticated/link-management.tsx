import { createFileRoute } from "@tanstack/react-router";
import { Link as LinkIcon } from "lucide-react";
import { SavedItemsManager } from "@/components/SavedItemsManager";

export const Route = createFileRoute("/_authenticated/link-management")({
  component: LinkManagementPage,
  head: () => ({ meta: [{ title: "Link Management" }, { name: "description", content: "Save and organise your important links with names and notes." }] }),
});

function LinkManagementPage() {
  return (
    <SavedItemsManager
      table="saved_links"
      title="Link Management"
      description="Store any URL with a memorable name and quick notes."
      icon={LinkIcon}
      urlPlaceholder="https://example.com/page"
    />
  );
}