"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Löschen mit Rückfrage. Ruft die Server-Action mit { id } auf. */
export function ConfirmDelete({
  id,
  action,
  title,
  description,
  label = "Löschen",
}: {
  id: string;
  action: (formData: FormData) => Promise<void>;
  title: string;
  description: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Abbrechen</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const data = new FormData();
                data.set("id", id);
                await action(data);
                setOpen(false);
              })
            }
          >
            {pending ? "Wird gelöscht …" : "Endgültig löschen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
