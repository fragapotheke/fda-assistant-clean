"use client";

import React from "react";
import Chat from "../components/Chat"; // Oder "@/components/Chat", falls dein Pfadalias funktioniert

export default function Page() {
  // Dummy-Widget für den lokalen Test, simuliert LiveChat-Session
  const mockWidget = {
    getCustomerProfile: () => ({
      id: "test-session-123", // beliebige Session-ID
    }),
  };

  return <Chat widget={mockWidget} />;
}