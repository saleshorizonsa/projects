"use client";

import { useState } from "react";
import { deleteProject, updateProject } from "@/app/actions";
import { PROJECT_STATUSES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
};

export function EditProjectDialog({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Edit</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>
        <form action={updateProject} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={project.id} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" name="name" required defaultValue={project.name} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              name="description"
              defaultValue={project.description ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select name="status" defaultValue={project.status}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SubmitButton className="self-end">Save changes</SubmitButton>
        </form>

        <form action={deleteProject} className="border-t pt-3">
          <input type="hidden" name="id" value={project.id} />
          <SubmitButton
            variant="destructive"
            size="sm"
            pendingText="Deleting…"
            className="w-full"
          >
            Delete project
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
