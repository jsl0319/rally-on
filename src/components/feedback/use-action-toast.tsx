"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { useRegionStore, useToast } from "@wanteddev/wds";

/** The root WDS provider keeps completion feedback visible across client navigation. */
export function useActionToast() {
  const toast = useToast();
  const clear = useRegionStore(state => state.removeAll);

  return (message: string) => {
    clear();
    toast({
      duration: 4500,
      icon: <CheckCircle aria-hidden size={22} weight="fill" className="text-[#dceda0]" />,
      content: message,
    });
  };
}
