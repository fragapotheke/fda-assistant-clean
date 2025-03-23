"use client";

import React from "react";
import Chat from "../components/Chat"; // oder "@/components/Chat", wenn Pfadalias

export default function Page() {
  const mockWidget = {
    getCustomerProfile: () => ({
      id: "test-session-123",
    }),
  };

  return <Chat widget={mockWidget as any} />;
}